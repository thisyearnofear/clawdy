import type { CloudConfig } from '../components/environment/CloudManager'
import type { AgentSession, WorldState, WeatherStatus } from './protocolTypes'

export type SkillProviderId = 'local-policy' | 'onchain-os'

export interface SkillProviderInfo {
  id: SkillProviderId
  label: string
  mode: 'fallback' | 'mcp'
  mcpReady: boolean
  summary: string
}

export interface SkillDecision {
  agentId: string
  provider: SkillProviderId
  title: string
  summary: string
  action: 'observe' | 'route' | 'bid' | 'rent'
  confidence: number
  createdAt: number
  metadata?: {
    targetAssetId?: number | null
    recommendedBid?: number
    recommendedVehicle?: string
    preset?: NonNullable<CloudConfig['preset']>
    mcpRequestId?: string
    mcpLatencyMs?: number
  }
}

export interface SkillEvaluationInput {
  session: AgentSession
  worldState: WorldState
  currentWeatherBid: WeatherStatus
}

// ── Provider resolution ──

function resolveMcpEndpoint() {
  const configuredEndpoint = process.env.NEXT_PUBLIC_ONCHAIN_OS_MCP_URL
  if (configuredEndpoint) return configuredEndpoint
  if (typeof window !== 'undefined') return '/api/mcp'
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${appBaseUrl.replace(/\/$/, '')}/api/mcp`
}

const ONCHAIN_OS_MCP_ENDPOINT = resolveMcpEndpoint()

function resolveProviderId(): SkillProviderId {
  const env = process.env.NEXT_PUBLIC_SKILL_PROVIDER
  if (env === 'onchain-os') return 'onchain-os'
  return 'local-policy'
}

const PROVIDER_ID = resolveProviderId()

const PROVIDER_INFO: Record<SkillProviderId, SkillProviderInfo> = {
  'local-policy': {
    id: 'local-policy',
    label: 'Local Policy',
    mode: 'fallback',
    mcpReady: false,
    summary: 'Fallback provider active. Swap in Onchain OS MCP at the same seam when available.',
  },
  'onchain-os': {
    id: 'onchain-os',
    label: 'Onchain OS / MCP',
    mode: 'mcp',
    mcpReady: true,
    summary: 'Onchain OS MCP skill provider active. Decisions routed through the MCP endpoint.',
  },
}

export function getSkillProviderInfo(): SkillProviderInfo {
  return PROVIDER_INFO[PROVIDER_ID]
}

// ── Onchain OS MCP call ──

interface McpSkillResponse {
  action: 'observe' | 'route' | 'bid' | 'rent'
  confidence: number
  reasoning: string
  metadata?: Record<string, unknown>
}

async function callOnchainOsMcp(
  input: SkillEvaluationInput,
): Promise<McpSkillResponse | null> {
  try {
    const start = performance.now()
    const res = await fetch(ONCHAIN_OS_MCP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill: 'clawdy-agent-decision',
        params: {
          role: input.session.role,
          agentId: input.session.agentId,
          assetCount: input.worldState.assets.length,
          vehicleCount: input.worldState.vehicles.length,
          currentWeatherBid: input.currentWeatherBid.amount,
        },
      }),
      signal: AbortSignal.timeout(3000),
    })
    const latency = Math.round(performance.now() - start)
    if (!res.ok) return null
    const data = (await res.json()) as McpSkillResponse & { requestId?: string }
    return {
      ...data,
      metadata: { ...data.metadata, mcpRequestId: data.requestId, mcpLatencyMs: latency },
    }
  } catch {
    return null
  }
}

// ── Local policy helpers ──

function findNearestAssetScore(session: AgentSession, worldState: WorldState) {
  const vehicle = worldState.vehicles.find((entry) => entry.id === session.vehicleId)
  if (!vehicle || worldState.assets.length === 0) {
    return { targetAssetId: null, distanceScore: 0 }
  }

  let minDistance = Infinity
  let targetAssetId: number | null = null

  for (const asset of worldState.assets) {
    const dx = asset.position[0] - vehicle.position[0]
    const dz = asset.position[2] - vehicle.position[2]
    const distance = Math.sqrt(dx * dx + dz * dz)
    if (distance < minDistance) {
      minDistance = distance
      targetAssetId = asset.id
    }
  }

  return {
    targetAssetId,
    distanceScore: Number.isFinite(minDistance) ? Math.max(0, 1 - minDistance / 30) : 0,
  }
}

function localPolicyDecision(input: SkillEvaluationInput): SkillDecision {
  const { session, worldState, currentWeatherBid } = input
  const createdAt = Date.now()
  const { targetAssetId, distanceScore } = findNearestAssetScore(session, worldState)
  const assetPressure = Math.min(worldState.assets.length / 10, 1)
  const strategyAggression = session.strategyAggression ?? 0
  const strategyWeatherFocus = session.strategyWeatherFocus ?? 0
  const strategyBias = 1 + strategyWeatherFocus * 0.4 + strategyAggression * 0.15
  const weatherOpportunity = Number(((assetPressure * 0.08 + distanceScore * 0.04) * strategyBias).toFixed(3))
  const sessionVehicle = worldState.vehicles.find((entry) => entry.id === session.vehicleId)

  if (session.role === 'weather' && weatherOpportunity > currentWeatherBid.amount) {
    return {
      agentId: session.agentId,
      provider: 'local-policy',
      title: 'Treasury cleared a weather play',
      summary: `Asset density and route score justify a ${weatherOpportunity.toFixed(3)} ETH bid.`,
      action: 'bid',
      confidence: Math.min(0.95, 0.5 + assetPressure * 0.25 + distanceScore * 0.2 + strategyWeatherFocus * 0.1),
      createdAt,
      metadata: {
        targetAssetId,
        recommendedBid: weatherOpportunity,
        preset: assetPressure > 0.6 ? 'stormy' : 'sunset',
      },
    }
  }

  if (session.role === 'scout' && targetAssetId !== null) {
    return {
      agentId: session.agentId,
      provider: 'local-policy',
      title: 'Scout updated the route',
      summary: `Nearest opportunity is asset #${targetAssetId}. Autopilot can route there now.`,
      action: 'route',
      confidence: Math.min(0.92, 0.55 + distanceScore * 0.35 + strategyAggression * 0.08),
      createdAt,
      metadata: { targetAssetId },
    }
  }

  if (session.role === 'mobility' && sessionVehicle && !sessionVehicle.isRented) {
    return {
      agentId: session.agentId,
      provider: 'local-policy',
      title: 'Mobility needs a vehicle lease',
      summary: `Vehicle ${session.vehicleId} is idle. Lease it before executing routes.`,
      action: 'rent',
      confidence: Math.min(0.9, 0.55 + assetPressure * 0.2 + distanceScore * 0.15 + strategyAggression * 0.05),
      createdAt,
      metadata: { recommendedVehicle: sessionVehicle.type },
    }
  }

  return {
    agentId: session.agentId,
    provider: 'local-policy',
    title: 'Treasury held position',
    summary: 'Current conditions do not justify new spend. Preserve balance and keep observing.',
    action: 'observe',
    confidence: 0.64,
    createdAt,
    metadata: { targetAssetId },
  }
}

// ── Public API ──

export async function evaluateAgentDecisionAsync(
  input: SkillEvaluationInput,
): Promise<SkillDecision> {
  if (PROVIDER_ID === 'onchain-os') {
    const mcpResult = await callOnchainOsMcp(input)
    if (mcpResult) {
      return {
        agentId: input.session.agentId,
        provider: 'onchain-os',
        title: `MCP: ${mcpResult.action}`,
        summary: mcpResult.reasoning,
        action: mcpResult.action,
        confidence: mcpResult.confidence,
        createdAt: Date.now(),
        metadata: mcpResult.metadata as SkillDecision['metadata'],
      }
    }
    const fallback = localPolicyDecision(input)
    fallback.summary = `[MCP unreachable — local fallback] ${fallback.summary}`
    return fallback
  }
  return localPolicyDecision(input)
}

/** Synchronous entry kept for backward compatibility */
export function evaluateAgentDecision(input: SkillEvaluationInput): SkillDecision {
  return localPolicyDecision(input)
}
