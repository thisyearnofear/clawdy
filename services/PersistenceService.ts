import { AgentSession } from './AgentProtocol'
import { ZgGameState } from './zgStorage'

export class PersistenceService {
  private zgSaveCounter = 0

  constructor() {}

  persistState(sessions: Map<string, AgentSession>) {
    if (typeof window === 'undefined') return
    try {
      const savedSessions: Record<string, unknown> = {}
      sessions.forEach((session, id) => {
        savedSessions[id] = {
          balance: session.balance,
          totalEarned: session.totalEarned,
          totalPaid: session.totalPaid,
          collectedCount: session.collectedCount,
          executedBidCount: session.executedBidCount,
          executedRentCount: session.executedRentCount,
          vitality: session.vitality,
          burden: session.burden,
          decisionCount: session.decisionCount,
        }
      })
      localStorage.setItem('clawdy:sessions', JSON.stringify(savedSessions))
      localStorage.setItem('clawdy:timestamp', Date.now().toString())

      // Persist to 0G Storage every 6th cycle (~30s if called every 5s)
      this.zgSaveCounter++
      if (this.zgSaveCounter >= 6) {
        this.zgSaveCounter = 0
        this.persistTo0G(savedSessions)
      }
    } catch { /* localStorage may be unavailable */ }
  }

  private async persistTo0G(sessions: Record<string, unknown>) {
    try {
      const { zgSaveState } = await import('./zgStorage')
      const state = {
        version: 1,
        timestamp: Date.now(),
        sessions: sessions as ZgGameState['sessions'],
      }
      const result = await zgSaveState('global', state)
      if (result.rootHash) {
        console.log('[0G Storage] State persisted, rootHash:', result.rootHash)
      } else if (result.error) {
        console.warn('[0G Storage] Save failed:', result.error)
      }
    } catch { /* 0G unavailable */ }
  }

  async restoreState(applyCallback: (saved: Record<string, Record<string, number>>) => void) {
    if (typeof window === 'undefined') return
    
    // Try localStorage first (fast)
    try {
      const timestamp = localStorage.getItem('clawdy:timestamp')
      if (timestamp && Date.now() - Number(timestamp) <= 3600000) {
        const raw = localStorage.getItem('clawdy:sessions')
        if (raw) {
          applyCallback(JSON.parse(raw))
          return
        }
      }
    } catch { /* ignore */ }

    // Fall back to 0G Storage
    try {
      const { zgLoadState } = await import('./zgStorage')
      const result = await zgLoadState('global')
      if (result.state?.sessions) {
        console.log('[0G Storage] Restored state from 0G, timestamp:', result.state.timestamp)
        applyCallback(result.state.sessions as unknown as Record<string, Record<string, number>>)
      }
    } catch { /* 0G unavailable */ }
  }
}

export const persistenceService = new PersistenceService()
