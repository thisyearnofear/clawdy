import type { AgentSession } from './protocolTypes'
import { ZgGameState } from './zgStorage'
import { useGameStore, type VehicleHandlingProfile } from './gameStore'
import { logger } from './logger'

export class PersistenceService {
  private zgSaveCounter = 0
  private zgAvailability: boolean | null = null
  private zgConfigured: boolean | null = null

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
    } catch (err) { logger.debug('[Persistence] localStorage write failed:', err) }
  }

  private async persistTo0G(sessions: Record<string, unknown>) {
    try {
      const store = useGameStore.getState()
      const { zgSaveState, zgHealth } = await import('./zgStorage')

      // Health check (cached) so UI can show whether uploads are configured.
      if (this.zgAvailability !== false || this.zgConfigured === null) {
        const health = await zgHealth()
        this.zgAvailability = health.ok
        this.zgConfigured = health.configured ?? false
        store.setZgStorage({
          checkedAt: Date.now(),
          available: this.zgAvailability,
          configured: this.zgConfigured,
          network: health.network,
          indexer: health.indexer,
          lastError: health.ok ? undefined : health.error,
        })
      }

      if (!this.zgAvailability || !this.zgConfigured) {
        return
      }

      const state = {
        version: 1,
        timestamp: Date.now(),
        sessions: sessions as ZgGameState['sessions'],
        steerRetentionOverrides: store.steerRetentionOverrides,
        lateralGripOverrides: store.lateralGripOverrides,
        accelerationOverrides: store.accelerationOverrides,
        maxSpeedOverrides: store.maxSpeedOverrides,
      }
      const result = await zgSaveState('global', state)
      if (result.error) {
        this.zgAvailability = false
        store.setZgStorage({
          checkedAt: Date.now(),
          available: false,
          lastError: result.error,
        })
        return
      }
      // Only log on success to keep console clean, or keep totally silent if configured
      if (result.rootHash) {
        // console.log('[0G Storage] State persisted')
        store.setZgStorage({
          checkedAt: Date.now(),
          available: true,
          configured: true,
          lastError: undefined,
          lastUpload: {
            key: 'global',
            rootHash: result.rootHash,
            txHash: result.txHash,
            timestamp: Date.now(),
          },
        })
      }
      } catch (err) { logger.debug('[Persistence] 0G save failed:', err) }

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
    } catch (err) { logger.debug('[Persistence] localStorage restore failed:', err) }

    // Fall back to 0G Storage
    try {
      const store = useGameStore.getState()
      const { zgLoadState } = await import('./zgStorage')
      const result = await zgLoadState('global')
      if (result.state?.sessions) {
        logger.info('[Persistence] Restored state from 0G, timestamp:', result.state.timestamp)
        applyCallback(result.state.sessions as unknown as Record<string, Record<string, number>>)
        // Restore handling overrides from 0G snapshot into both store and localStorage
        if (result.state.steerRetentionOverrides) {
          const steer = result.state.steerRetentionOverrides
          for (const [profile, value] of Object.entries(steer)) {
            store.setSteerRetentionOverride(profile as VehicleHandlingProfile, value)
          }
        }
        if (result.state.lateralGripOverrides) {
          const grip = result.state.lateralGripOverrides
          for (const [profile, value] of Object.entries(grip)) {
            store.setLateralGripOverride(profile as VehicleHandlingProfile, value)
          }
        }
        if (result.state.accelerationOverrides) {
          const accel = result.state.accelerationOverrides
          for (const [profile, value] of Object.entries(accel)) {
            store.setAccelerationOverride(profile as VehicleHandlingProfile, value)
          }
        }
        if (result.state.maxSpeedOverrides) {
          const speed = result.state.maxSpeedOverrides
          for (const [profile, value] of Object.entries(speed)) {
            store.setMaxSpeedOverride(profile as VehicleHandlingProfile, value)
          }
        }
        store.setZgStorage({
          checkedAt: Date.now(),
          available: true,
          lastRestore: {
            timestamp: Date.now(),
            rootHash: localStorage.getItem('clawdy:0g:global') ?? undefined,
          },
        })
      }
    } catch (err) { logger.debug('[Persistence] 0G restore failed:', err) }
  }
}

export const persistenceService = new PersistenceService()
