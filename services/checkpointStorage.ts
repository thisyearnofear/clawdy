import { type PolicyCheckpoint, SEASON_0_BASE_CHECKPOINT, validateCheckpoint } from './policyModel'
import type { ArenaTrainingExample } from './policyTrainer'

export const CHECKPOINT_STORAGE_KEY = 'clawdy_checkpoints_v1'
export const EXAMPLES_STORAGE_KEY = 'clawdy_examples_v1'

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage
    }
  } catch {
    // Storage access might throw in sandboxed iframes
  }
  return null
}

export function loadStoredCheckpoints(): PolicyCheckpoint[] {
  const storage = getLocalStorage()
  if (!storage) return [SEASON_0_BASE_CHECKPOINT]

  try {
    const raw = storage.getItem(CHECKPOINT_STORAGE_KEY)
    if (!raw) return [SEASON_0_BASE_CHECKPOINT]

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return [SEASON_0_BASE_CHECKPOINT]

    const validCheckpoints: PolicyCheckpoint[] = []
    for (const item of parsed) {
      try {
        validateCheckpoint(item)
        validCheckpoints.push(item)
      } catch {
        // Skip invalid item
      }
    }

    if (validCheckpoints.length === 0) return [SEASON_0_BASE_CHECKPOINT]
    // Ensure base checkpoint is present in the list
    if (!validCheckpoints.some(c => c.id === SEASON_0_BASE_CHECKPOINT.id)) {
      validCheckpoints.push(SEASON_0_BASE_CHECKPOINT)
    }
    return validCheckpoints
  } catch {
    return [SEASON_0_BASE_CHECKPOINT]
  }
}

export function saveStoredCheckpoints(checkpoints: PolicyCheckpoint[]): void {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(checkpoints))
  } catch (err) {
    console.warn('[checkpointStorage] Failed to save checkpoints to localStorage:', err)
  }
}

export function loadStoredExamples(): ArenaTrainingExample[] {
  const storage = getLocalStorage()
  if (!storage) return []

  try {
    const raw = storage.getItem(EXAMPLES_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(item => (
      item &&
      typeof item.id === 'string' &&
      typeof item.sourceEpisodeId === 'string' &&
      typeof item.tick === 'number' &&
      typeof item.rationale === 'string' &&
      typeof item.preferredAction === 'object' &&
      item.preferredAction !== null &&
      typeof item.observation === 'object' &&
      item.observation !== null
    ))
  } catch {
    return []
  }
}

export function saveStoredExamples(examples: ArenaTrainingExample[]): void {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.setItem(EXAMPLES_STORAGE_KEY, JSON.stringify(examples))
  } catch (err) {
    console.warn('[checkpointStorage] Failed to save examples to localStorage:', err)
  }
}

export function exportCheckpointJson(checkpoint: PolicyCheckpoint): string {
  validateCheckpoint(checkpoint)
  return JSON.stringify(checkpoint, null, 2)
}

export function importCheckpointJson(jsonText: string): PolicyCheckpoint {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : 'Parse failed'}`)
  }

  try {
    validateCheckpoint(parsed as PolicyCheckpoint)
  } catch (err) {
    throw new Error(`JSON is not a valid Clawdy Season 0 PolicyCheckpoint: ${err instanceof Error ? err.message : 'Validation failed'}`)
  }

  return parsed as PolicyCheckpoint
}

export function downloadCheckpointFile(checkpoint: PolicyCheckpoint): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const jsonStr = exportCheckpointJson(checkpoint)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const safeName = checkpoint.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
  anchor.href = url
  anchor.download = `checkpoint-${safeName}-${checkpoint.id.slice(0, 8)}.json`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}
