import type { ArenaAction, ArenaRejection, ArenaSnapshot } from './arenaEpisode'

export type ArenaPhase = 'ready' | 'running' | 'paused' | 'finished' | 'review' | 'error'

export type ArenaEvent =
  | {
      type: 'match_start'
      matchId: string
      scenarioId: string
      rulesVersion: string
      controllerVersion: string
      players: { id: string; policyVersion: string }[]
    }
  | { type: 'tick'; matchId: string; tick: number; episode: ArenaSnapshot }
  | {
      type: 'action_result'
      matchId: string
      agentId: string
      tick: number
      action: ArenaAction | null
      accepted: boolean
      reason: ArenaRejection | null
    }
  | { type: 'phase'; matchId: string; previous: ArenaPhase; current: ArenaPhase }
  | {
      type: 'policy_change'
      matchId: string
      agentId: string
      strategy: string
      checkpointId?: string
    }
  | {
      type: 'match_end'
      matchId: string
      outcome: 'finished' | 'error' | 'surrender' | 'disconnect'
      score: Record<string, number>
    }
  | { type: 'error'; matchId: string; message: string }

export type ArenaEventOf<T extends ArenaEvent['type']> = Extract<ArenaEvent, { type: T }>

export type ArenaEventListener<T extends ArenaEvent['type'] = ArenaEvent['type']> = (event: ArenaEventOf<T>) => void
