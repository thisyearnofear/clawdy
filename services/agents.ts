import type { AgentRole } from './AgentProtocol'

export interface AgentProfile {
  id: string
  shortLabel: string
  role: AgentRole
  label: string
  mission: string
  vehicleId?: string
  accentColor: string
}

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'Player',
    shortLabel: 'PLAYER',
    role: 'operator',
    label: 'Operator',
    mission: 'Supervises the sandbox and authorizes agent budgets.',
    accentColor: '#ffffff',
  },
  {
    id: 'Agent-Zero',
    shortLabel: 'ZERO',
    role: 'scout',
    label: 'Scout Agent',
    mission: 'Scans world state and identifies profitable routes.',
    vehicleId: 'agent-1',
    accentColor: '#00d2ff',
  },
  {
    id: 'Agent-One',
    shortLabel: 'ONE',
    role: 'weather',
    label: 'Weather Agent',
    mission: 'Bids for climate states that increase resource yield.',
    vehicleId: 'agent-2',
    accentColor: '#a29bfe',
  },
  {
    id: 'Agent-Two',
    shortLabel: 'TWO',
    role: 'mobility',
    label: 'Mobility Agent',
    mission: 'Secures vehicle leases and converts route plans into movement.',
    vehicleId: 'agent-3',
    accentColor: '#f59e0b',
  },
]

const AGENT_PROFILE_MAP = new Map(AGENT_PROFILES.map((profile) => [profile.id, profile]))
const VEHICLE_PROFILE_MAP = new Map(
  AGENT_PROFILES.filter((profile) => profile.vehicleId).map((profile) => [profile.vehicleId!, profile]),
)

export function getAgentProfile(agentId: string): AgentProfile | undefined {
  return AGENT_PROFILE_MAP.get(agentId)
}

export function getAgentRole(agentId: string): AgentRole {
  return getAgentProfile(agentId)?.role || 'mobility'
}

export function getAgentMission(agentId: string): string {
  return getAgentProfile(agentId)?.mission || 'Rents vehicles and translates plans into movement.'
}

export function getAgentVehicleId(agentId: string): string {
  return getAgentProfile(agentId)?.vehicleId || agentId
}

export function getAgentByVehicleId(vehicleId?: string): AgentProfile | undefined {
  if (!vehicleId) return undefined
  return VEHICLE_PROFILE_MAP.get(vehicleId)
}

export function getControllableAgents(): AgentProfile[] {
  return AGENT_PROFILES.filter((profile) => profile.id !== 'Player')
}
