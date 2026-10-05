import { describe, expect, it } from 'vitest'
import { ConvexError } from 'convex/values'
import { FORGE_MESSAGES } from '../forge'
import {
  STANDARD_LOOK,
  describeForgeError,
  forgeFormState,
  latestFailure,
  parseLookChoice,
  pendingForge,
  pickForgedLook,
  readyForges,
  type ForgeRow,
} from '../forgeView'
import { resolveForgedModel } from '../chassisAssets'

function row(id: string, createdAt: number, status: ForgeRow['status'], extra: Partial<ForgeRow> = {}): ForgeRow {
  return { id, chassis: 'raider', paint: 'ember', status, createdAt, url: status === 'ready' ? `https://files.example/${id}` : null, error: null, ...extra }
}

describe('forged look', () => {
  const older = row('a', 1, 'ready')
  const newer = row('b', 2, 'ready', { chassis: 'scout' })

  it('shows the newest ready forge by default', () => {
    expect(pickForgedLook([older, newer], 'auto')).toEqual({ forgeId: 'b', chassis: 'scout', url: 'https://files.example/b' })
  })

  it('honours an explicit choice, and "standard" turns the forged look off', () => {
    expect(pickForgedLook([older, newer], 'a')?.forgeId).toBe('a')
    expect(pickForgedLook([older, newer], STANDARD_LOOK)).toBeNull()
  })

  it('falls back to the newest ready forge when the chosen one is gone or not ready', () => {
    expect(pickForgedLook([older, newer], 'deleted')?.forgeId).toBe('b')
    expect(pickForgedLook([row('p', 3, 'pending'), older], 'p')?.forgeId).toBe('a')
  })

  it('has no forged look without a ready forge that has a url', () => {
    expect(pickForgedLook([], 'auto')).toBeNull()
    expect(pickForgedLook([row('p', 1, 'pending'), row('f', 2, 'failed')], 'auto')).toBeNull()
    expect(pickForgedLook([row('x', 1, 'ready', { url: null })], 'auto')).toBeNull()
    expect(readyForges([row('x', 1, 'ready', { url: null })])).toEqual([])
  })

  it('parses stored choices defensively', () => {
    expect(parseLookChoice(null)).toBe('auto')
    expect(parseLookChoice('')).toBe('auto')
    expect(parseLookChoice('x'.repeat(200))).toBe('auto')
    expect(parseLookChoice(' standard ')).toBe('standard')
  })
})

describe('forge form', () => {
  it('needs sign-in, and blocks while a forge is running or being submitted', () => {
    expect(forgeFormState({ signedIn: false, rows: [], submitting: false })).toEqual({ canForge: false, reason: FORGE_MESSAGES['sign-in-required'] })
    expect(forgeFormState({ signedIn: true, rows: [row('p', 1, 'pending')], submitting: false })).toEqual({ canForge: false, reason: FORGE_MESSAGES['forge-busy'] })
    expect(forgeFormState({ signedIn: true, rows: [], submitting: true }).canForge).toBe(false)
    expect(forgeFormState({ signedIn: true, rows: [row('a', 1, 'ready')], submitting: false })).toEqual({ canForge: true, reason: null })
    expect(pendingForge([row('a', 1, 'ready'), row('p', 2, 'pending')])?.id).toBe('p')
  })

  it('only surfaces a failure newer than the last success', () => {
    const failed = row('f', 5, 'failed', { error: FORGE_MESSAGES['tripo-failed'] })
    expect(latestFailure([row('a', 1, 'ready'), failed])?.id).toBe('f')
    expect(latestFailure([row('a', 9, 'ready'), failed])).toBeUndefined()
    expect(latestFailure([row('a', 1, 'ready')])).toBeUndefined()
  })

  it('shows the server message for known codes and a generic one otherwise', () => {
    expect(describeForgeError(new ConvexError('forge-cap-reached'))).toBe(FORGE_MESSAGES['forge-cap-reached'])
    expect(describeForgeError(new ConvexError('forge-limit-reached'))).toBe(FORGE_MESSAGES['forge-limit-reached'])
    expect(describeForgeError(new ConvexError('something-new'))).toMatch(/try again/)
    expect(describeForgeError(new Error('network'))).toMatch(/try again/)
  })
})

describe('resolveForgedModel', () => {
  it('borrows the chassis body transform so the forged rover faces and sits like its chassis', () => {
    const forged = resolveForgedModel('hauler', 'https://files.example/h')
    expect(forged.url).toBe('https://files.example/h')
    expect(forged.key).toBe('forged.hauler')
    expect(forged.transform?.rotation[1]).toBeCloseTo(-Math.PI / 2)
  })

  it('uses an identity transform for an unknown chassis rather than throwing', () => {
    expect(resolveForgedModel('tank', 'https://files.example/t').transform).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })
  })
})
