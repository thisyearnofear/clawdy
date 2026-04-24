import type { AgentSession } from './protocolTypes'
import { economyEngine } from './EconomyEngine'

const MAX_GRAVEYARD_SIZE = 20

/**
 * SessionManager owns the session lifecycle — creation, lookup, mutation, and cleanup.
 * It encapsulates the sessions map and graveyard, providing a focused API for
 * session CRUD without mixing in transaction logic, event dispatch, or store sync.
 *
 * The parent facade (AgentProtocol) is responsible for calling syncWithStore()
 * after mutations that need to be reflected in the UI.
 */
export class SessionManager {
  private sessions: Map<string, AgentSession> = new Map()
  private graveyard: AgentSession[] = []

  /** Create a new agent session or return true if already exists. */
  authorizeAgent(agentId: string, duration: number, initialBalance: number = 1.0): boolean {
    if (this.sessions.has(agentId)) return true
    const session = economyEngine.authorizeAgent(agentId, duration, initialBalance)
    this.sessions.set(agentId, session)
    return true
  }

  /** Get a single session by agent ID. */
  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id)
  }

  /** Get all active sessions as an array. */
  getSessions(): AgentSession[] {
    return Array.from(this.sessions.values())
  }

  /** Get the sessions map entries for iteration. */
  getSessionEntries(): IterableIterator<[string, AgentSession]> {
    return this.sessions.entries()
  }

  /** Get the raw sessions map (for persistence). */
  getSessionMap(): Map<string, AgentSession> {
    return this.sessions
  }

  /** Get the number of active sessions. */
  getSessionCount(): number {
    return this.sessions.size
  }

  /** Toggle autopilot for a session. */
  toggleAutoPilot(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (session) {
      session.autoPilot = !session.autoPilot
    }
  }

  /** Apply restored state data (from persistence) into active sessions. */
  applyRestoredState(saved: Record<string, Record<string, number>>): void {
    for (const [id, data] of Object.entries(saved)) {
      const session = this.sessions.get(id)
      if (session && data) {
        Object.assign(session, data)
      }
    }
  }

  /** Remove a dead agent: move to graveyard, delete from sessions. Returns the dead session if found.
   *  Note: Caller (the facade) is responsible for cleaning up approval gate entries before calling this. */
  removeDeadAgent(agentId: string): AgentSession | undefined {
    const session = this.sessions.get(agentId)
    if (!session) return undefined

    // Move to graveyard
    this.graveyard.push({ ...session })
    if (this.graveyard.length > MAX_GRAVEYARD_SIZE) {
      this.graveyard.shift()
    }

    this.sessions.delete(agentId)
    return session
  }

  /** Get graveyard entries (for leaderboard/history). */
  getGraveyard(): AgentSession[] {
    return [...this.graveyard]
  }

  /** Logout: delete Player session, re-authorize fresh. Caller handles isPermissioned state. */
  logout(): void {
    this.sessions.delete('Player')
    this.authorizeAgent('Player', 3600000 * 24, 10.0)
  }
}
