import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { chassisAssetKey, registeredChassisBodies, resolveRoverModel } from '../chassisAssets'
import { getMintAsset } from '../mintAssets'

describe('chassis assets', () => {
  it('keys chassis bodies as chassis.<id>', () => {
    expect(chassisAssetKey('scout')).toBe('chassis.scout')
    expect(chassisAssetKey('raider')).toBe('chassis.raider')
  })

  it('keeps the legacy look when no chassis is given (old brains, pinned scenarios)', () => {
    const rival = resolveRoverModel('rival')
    expect(rival.key).toBe('rivalRover')
    expect(rival.url).toBe('/assets/tripo/rival-rover.glb')
    expect(rival.transform?.rotation[1]).toBeCloseTo(-Math.PI / 2)
  })

  it('falls back to the legacy asset when a chassis has no registered body', () => {
    for (const id of ['scout', 'hauler', 'raider'] as const) {
      if (getMintAsset(chassisAssetKey(id))) continue
      expect(resolveRoverModel('rival', id).key).toBe('rivalRover')
    }
  })

  it('ignores unknown chassis ids and resolves to procedural for unknown entrants', () => {
    expect(resolveRoverModel('rival', 'tank').key).toBe('rivalRover')
    expect(resolveRoverModel('ghost')).toEqual({})
  })

  it('only reports chassis bodies that are registered', () => {
    for (const id of registeredChassisBodies()) expect(getMintAsset(chassisAssetKey(id))).toBeDefined()
  })

  it('registers all three chassis bodies as small, valid GLBs on disk', () => {
    expect(registeredChassisBodies().sort()).toEqual(['hauler', 'raider', 'scout'])
    for (const id of registeredChassisBodies()) {
      const model = resolveRoverModel('champion', id)
      expect(model.key).toBe(chassisAssetKey(id))
      const file = join(process.cwd(), 'public', model.url!)
      expect(existsSync(file)).toBe(true)
      expect(readFileSync(file).subarray(0, 4).toString('latin1')).toBe('glTF')
      expect(statSync(file).size).toBeLessThan(1.5 * 1024 * 1024)
    }
  })
})
