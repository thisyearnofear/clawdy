/**
 * clawdy:arena — Season 0 wire contract.
 *
 * Defines the typed message surface for a future WebSocket transport that
 * exposes an {@link ArenaSession} to external consumers (spectator UI, headless
 * evaluator, or an external policy client). The contract mirrors the
 * {@link ArenaEvent} stream already emitted by `ArenaSession` and adds the
 * client-to-server envelope for bot decisions.
 *
 * This module is transport-agnostic: it provides message types, a codec, and a
 * bridge that adapts an `ArenaSession` event subscription into a stream of
 * `ServerMessage` values. A concrete WebSocket server can layer on top without
 * changing the session or protocol modules.
 *
 * Trust boundary:
 * - Coach/entrant messages (`coach`, `approve`, `select_checkpoint`) never
 *   inject actions into a live match. They only influence training, which
 *   writes a new checkpoint outside the scored run.
 * - Bot/competitor messages (`decision`) are the only client-to-server path
 *   that affects simulation state, and only through the queued action
 *   lifecycle (`decision -> decision_ack -> action_result`).
 */

import type { ArenaAction, ArenaObservation } from './arenaEpisode'
import type { ArenaEvent, ArenaPhase } from './arenaProtocol'
import type { PolicyCheckpoint } from './policyModel'

export const TRANSPORT_PROTOCOL_VERSION = 'clawdy:arena.v1' as const

// ---------------------------------------------------------------------------
// Server -> client messages
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: 'hello'; protocolVersion: typeof TRANSPORT_PROTOCOL_VERSION; serverVersion: string }
  | { type: 'match_start'; matchId: string; scenarioId: string; rulesVersion: string; controllerVersion: string; players: { id: string; policyVersion: string }[]; playerIndex: number; scored: boolean }
  | { type: 'state'; matchId: string; tick: number; totalTicks: number; phase: ArenaPhase; observation: ArenaObservation }
  | { type: 'decision_ack'; matchId: string; agentId: string; sequence: number; tick: number; accepted: boolean; reason: string | null }
  | { type: 'action_result'; matchId: string; agentId: string; tick: number; action: ArenaAction | null; accepted: boolean; reason: string | null }
  | { type: 'phase'; matchId: string; previous: ArenaPhase; current: ArenaPhase }
  | { type: 'match_end'; matchId: string; outcome: 'finished' | 'error' | 'surrender' | 'disconnect'; score: Record<string, number>; replayId: string | null }
  | { type: 'error'; matchId: string; message: string }

// ---------------------------------------------------------------------------
// Client -> server messages
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: 'authenticate'; token: string; role: 'coach' | 'bot'; entrantId: string }
  | { type: 'decision'; matchId: string; sequence: number; action: ArenaAction }
  | { type: 'coach'; matchId: string; message: string }
  | { type: 'approve'; matchId: string; exampleIds: string[] }
  | { type: 'select_checkpoint'; matchId: string; checkpoint: PolicyCheckpoint }
  | { type: 'ping' }
  | { type: 'pong' }

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

export function encodeMessage(message: ServerMessage | ClientMessage): string {
  return JSON.stringify(message)
}

export function decodeServerMessage(data: string): ServerMessage | null {
  try {
    const value = JSON.parse(data)
    if (value && typeof value === 'object' && typeof value.type === 'string') return value as ServerMessage
  } catch { /* fall through */ }
  return null
}

export function decodeClientMessage(data: string): ClientMessage | null {
  try {
    const value = JSON.parse(data)
    if (value && typeof value === 'object' && typeof value.type === 'string') return value as ClientMessage
  } catch { /* fall through */ }
  return null
}

// ---------------------------------------------------------------------------
// Bridge: ArenaSession events -> ServerMessage stream
// ---------------------------------------------------------------------------

export interface ArenaTransportBridge {
  /** Subscribe to the server-side message stream. Returns an unsubscribe function. */
  subscribe(listener: (message: ServerMessage) => void): () => void
  /** Emit a hello handshake. */
  hello(serverVersion: string): void
  /** Tear down all subscriptions. */
  dispose(): void
}

/**
 * Creates a bridge that converts `ArenaSession` events into `ServerMessage`
 * values. The bridge subscribes to the session's typed event bus and forwards
 * each event as a transport message. A concrete transport (WebSocket, postMessage,
 * etc.) only needs to pipe the output to its wire.
 */
export function createArenaTransport(
  session: {
    on<T extends ArenaEvent['type']>(type: T, listener: (event: Extract<ArenaEvent, { type: T }>) => void): () => void
  },
  playerIndex = 0,
): ArenaTransportBridge {
  const listeners = new Set<(message: ServerMessage) => void>()
  const unsubs: Array<() => void> = []

  function safeUnsub(unsub: () => void): () => void {
    return () => { try { unsub() } catch { /* session may already be disposed */ } }
  }

  function emit(message: ServerMessage) {
    for (const listener of listeners) listener(message)
  }

  unsubs.push(safeUnsub(session.on('match_start', (event) => {
    emit({
      type: 'match_start',
      matchId: event.matchId,
      scenarioId: event.scenarioId,
      rulesVersion: event.rulesVersion,
      controllerVersion: event.controllerVersion,
      players: event.players,
      playerIndex,
      scored: event.scored,
    })
  })))

  unsubs.push(safeUnsub(session.on('tick', (event) => {
    emit({
      type: 'state',
      matchId: event.matchId,
      tick: event.tick,
      totalTicks: event.episode.tick + 1,
      phase: 'running',
      observation: {} as ArenaObservation, // observation is per-agent; transport consumers request via observe()
    })
  })))

  unsubs.push(safeUnsub(session.on('decision_ack', (event) => {
    emit({
      type: 'decision_ack',
      matchId: event.matchId,
      agentId: event.agentId,
      sequence: event.sequence,
      tick: event.tick,
      accepted: event.accepted,
      reason: event.reason,
    })
  })))

  unsubs.push(safeUnsub(session.on('action_result', (event) => {
    emit({
      type: 'action_result',
      matchId: event.matchId,
      agentId: event.agentId,
      tick: event.tick,
      action: event.action,
      accepted: event.accepted,
      reason: event.reason,
    })
  })))

  unsubs.push(safeUnsub(session.on('phase', (event) => {
    emit({ type: 'phase', matchId: event.matchId, previous: event.previous, current: event.current })
  })))

  unsubs.push(safeUnsub(session.on('match_end', (event) => {
    emit({
      type: 'match_end',
      matchId: event.matchId,
      outcome: event.outcome,
      score: event.score,
      replayId: null,
    })
  })))

  unsubs.push(safeUnsub(session.on('error', (event) => {
    emit({ type: 'error', matchId: event.matchId, message: event.message })
  })))

  return {
    subscribe(listener: (message: ServerMessage) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    hello(serverVersion: string) {
      emit({ type: 'hello', protocolVersion: TRANSPORT_PROTOCOL_VERSION, serverVersion })
    },
    dispose() {
      for (const unsub of unsubs) unsub()
      unsubs.length = 0
      listeners.clear()
    },
  }
}
