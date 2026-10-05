import { describe, expect, it } from 'vitest'
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
})
