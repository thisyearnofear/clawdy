import { agentProtocol } from './AgentProtocol'
import { CHAIN_NAME } from './protocolTypes'
import { getAgentProfile } from './agents'

export interface ActivityEntry {
  id: string
  roleLabel: string
  provider: string
  totalEarned: number
  collectedCount: number
  executedBidCount: number
  executedRentCount: number
  source: 'runtime' | 'indexed'
}

export interface ActivitySummary {
  decisions: number
  bids: number
  rents: number
  indexedAgents: number
}

export type ActivityDataSource = 'live-indexed' | 'indexed-fallback' | 'runtime-only'

export interface ActivitySnapshot {
  entries: ActivityEntry[]
  summary: ActivitySummary
  hasIndexedData: boolean
  indexerLabel: string
  dataSource: ActivityDataSource
}

const INDEXER_GRAPHQL_URL = process.env.NEXT_PUBLIC_INDEXER_GRAPHQL_URL
const SNAPSHOT_TTL_MS = 5000
let snapshotCache: { value: ActivitySnapshot; createdAt: number } | null = null

const INDEXED_ACTIVITY_QUERY = `
  query ClawdyActivity {
    agents {
      id
      totalEarned
      totalRentPaid
      totalWeatherBid
      itemsCollectedCount
    }
    weatherControls {
      id
      agent {
        id
      }
    }
    vehicleRentals {
      id
      agent {
        id
      }
    }
  }
`

const HISTORICAL_FALLBACK: ActivityEntry[] = [
  {
    id: '0xAlpha...dead',
    roleLabel: 'Historical Agent',
    provider: 'indexed',
    totalEarned: 1.245,
    collectedCount: 842,
    executedBidCount: 11,
    executedRentCount: 6,
    source: 'indexed',
  },
  {
    id: '0xBeta...cafe',
    roleLabel: 'Historical Agent',
    provider: 'indexed',
    totalEarned: 0.892,
    collectedCount: 512,
    executedBidCount: 7,
    executedRentCount: 4,
    source: 'indexed',
  },
]

interface IndexedAgentRow {
  id: string
  totalEarned?: string
  itemsCollectedCount?: number
}

interface IndexedRelationRow {
  agent?: { id?: string }
}

interface IndexedActivityResponse {
  data?: {
    agents?: IndexedAgentRow[]
    weatherControls?: IndexedRelationRow[]
    vehicleRentals?: IndexedRelationRow[]
  }
}

function buildRuntimeEntries(): ActivityEntry[] {
  return agentProtocol.getSessions().map((session) => ({
    id: session.agentId,
    roleLabel: getAgentProfile(session.agentId)?.label || session.role,
    provider: session.lastSkillProvider || 'manual',
    totalEarned: session.totalEarned,
    collectedCount: session.collectedCount,
    executedBidCount: session.executedBidCount,
    executedRentCount: session.executedRentCount,
    source: 'runtime',
  }))
}

function summarize(entries: ActivityEntry[]): ActivitySummary {
  const sessions = agentProtocol.getSessions()
  return {
    decisions: sessions.reduce((sum, session) => sum + session.decisionCount, 0),
    bids: entries.reduce((sum, entry) => sum + entry.executedBidCount, 0),
    rents: entries.reduce((sum, entry) => sum + entry.executedRentCount, 0),
    indexedAgents: entries.filter((entry) => entry.source === 'indexed').length,
  }
}

function mergeEntries(runtimeEntries: ActivityEntry[], indexedEntries: ActivityEntry[]): ActivityEntry[] {
  const merged = new Map<string, ActivityEntry>()

  for (const entry of indexedEntries) {
    merged.set(entry.id, entry)
  }

  for (const entry of runtimeEntries) {
    const previous = merged.get(entry.id)
    merged.set(entry.id, {
      ...previous,
      ...entry,
      totalEarned: Math.max(entry.totalEarned, previous?.totalEarned || 0),
      collectedCount: Math.max(entry.collectedCount, previous?.collectedCount || 0),
      executedBidCount: Math.max(entry.executedBidCount, previous?.executedBidCount || 0),
      executedRentCount: Math.max(entry.executedRentCount, previous?.executedRentCount || 0),
      source: previous ? 'indexed' : entry.source,
    })
  }

  return [...merged.values()].sort((a, b) => {
    const actionDiff =
      b.executedBidCount + b.executedRentCount - (a.executedBidCount + a.executedRentCount)
    if (actionDiff !== 0) return actionDiff
    return b.totalEarned - a.totalEarned
  })
}

async function fetchIndexedEntries(): Promise<ActivityEntry[]> {
  if (!INDEXER_GRAPHQL_URL) {
    return HISTORICAL_FALLBACK
  }

  const response = await fetch(INDEXER_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: INDEXED_ACTIVITY_QUERY }),
  })

  if (!response.ok) {
    throw new Error(`Indexer query failed with status ${response.status}`)
  }

  const payload = (await response.json()) as IndexedActivityResponse
  const agents = payload.data?.agents || []
  const weatherControls = payload.data?.weatherControls || []
  const vehicleRentals = payload.data?.vehicleRentals || []

  const bidCountByAgent = new Map<string, number>()
  const rentCountByAgent = new Map<string, number>()

  for (const item of weatherControls) {
    const agentId = item.agent?.id
    if (!agentId) continue
    bidCountByAgent.set(agentId, (bidCountByAgent.get(agentId) || 0) + 1)
  }

  for (const item of vehicleRentals) {
    const agentId = item.agent?.id
    if (!agentId) continue
    rentCountByAgent.set(agentId, (rentCountByAgent.get(agentId) || 0) + 1)
  }

  return agents.map((agent) => ({
    id: agent.id,
    roleLabel: 'Indexed Agent',
    provider: 'indexed',
    totalEarned: Number(agent.totalEarned || 0),
    collectedCount: agent.itemsCollectedCount || 0,
    executedBidCount: bidCountByAgent.get(agent.id) || 0,
    executedRentCount: rentCountByAgent.get(agent.id) || 0,
    source: 'indexed',
  }))
}

export async function getActivitySnapshot(): Promise<ActivitySnapshot> {
  if (snapshotCache && Date.now() - snapshotCache.createdAt < SNAPSHOT_TTL_MS) {
    return snapshotCache.value
  }

  const runtimeEntries = buildRuntimeEntries()

  try {
    const indexedEntries = await fetchIndexedEntries()
    const entries = mergeEntries(runtimeEntries, indexedEntries)
    const snapshot: ActivitySnapshot = {
      entries,
      summary: summarize(entries),
      hasIndexedData: true,
      indexerLabel: INDEXER_GRAPHQL_URL ? `${CHAIN_NAME} indexer` : 'indexed fallback',
      dataSource: (INDEXER_GRAPHQL_URL ? 'live-indexed' : 'indexed-fallback') as ActivityDataSource,
    }
    snapshotCache = { value: snapshot, createdAt: Date.now() }
    return snapshot
  } catch {
    const snapshot: ActivitySnapshot = {
      entries: mergeEntries(runtimeEntries, HISTORICAL_FALLBACK),
      summary: summarize(runtimeEntries),
      hasIndexedData: false,
      indexerLabel: 'indexer unavailable',
      dataSource: 'runtime-only',
    }
    snapshotCache = { value: snapshot, createdAt: Date.now() }
    return snapshot
  }
}
