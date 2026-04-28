/**
 * 0G Storage & Memory Service
 *
 * Provides decentralized persistence for agent state via 0G Storage.
 * - Server-side: uses @0gfoundation/0g-ts-sdk for upload/download
 * - Client-side: calls Next.js API routes which proxy to the SDK
 *
 * Data model:
 *   Key: "clawdy:state:<walletAddress | 'global'>"
 *   Value: JSON blob of all agent sessions + world state
 */

// ── Client-side helpers (safe for browser) ──────────────────────────

export interface ZgGameState {
  version: number
  timestamp: number
  sessions: Record<string, {
    balance: number
    totalEarned: number
    totalPaid: number
    collectedCount: number
    executedBidCount: number
    executedRentCount: number
    vitality: number
    burden: number
    decisionCount: number
  }>
  steerRetentionOverrides?: Record<string, number>
  lateralGripOverrides?: Record<string, number>
  accelerationOverrides?: Record<string, number>
  maxSpeedOverrides?: Record<string, number>
  weatherPreset?: string
  auctionRound?: number
}

const ZG_API_BASE = '/api/0g-storage'

export interface ZgHealthStatus {
  ok: boolean
  configured?: boolean
  network?: string
  indexer?: string
  error?: string
}

/**
 * Save game state to 0G Storage via API route.
 * Falls back to localStorage on failure.
 */
export async function zgSaveState(
  key: string,
  state: ZgGameState
): Promise<{ rootHash?: string; txHash?: string; error?: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const apiSecret = process.env.NEXT_PUBLIC_API_SECRET
    if (apiSecret) headers['Authorization'] = `Bearer ${apiSecret}`

    const res = await fetch(ZG_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key, state }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Upload failed' }

    // Cache the root hash locally so we can retrieve later
    if (data.rootHash) {
      localStorage.setItem(`clawdy:0g:${key}`, data.rootHash)
      localStorage.setItem(`clawdy:0g:${key}:ts`, Date.now().toString())
    }
    return { rootHash: data.rootHash, txHash: data.txHash }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

/**
 * Load game state from 0G Storage via API route.
 * Uses the cached rootHash from localStorage.
 */
export async function zgLoadState(key: string): Promise<{ state?: ZgGameState; error?: string }> {
  try {
    const rootHash = localStorage.getItem(`clawdy:0g:${key}`)
    if (!rootHash) return { error: 'No 0G root hash cached for this key' }

    const res = await fetch(`${ZG_API_BASE}?rootHash=${encodeURIComponent(rootHash)}`)
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'Download failed' }
    return { state: data.state }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

/**
 * Check if 0G storage is available (API route responds).
 */
export async function zgIsAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ZG_API_BASE}?health=1`)
    return res.ok
  } catch {
    return false
  }
}

/**
 * Fetch detailed status from the 0G Storage API route.
 */
export async function zgHealth(): Promise<ZgHealthStatus> {
  try {
    const res = await fetch(`${ZG_API_BASE}?health=1`)
    const data = (await res.json()) as ZgHealthStatus
    if (!res.ok) return { ok: false, error: data.error || 'Health check failed' }
    return data
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
