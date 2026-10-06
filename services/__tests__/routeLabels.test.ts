import { describe, expect, it } from 'vitest'
import { disambiguateRouteLabels, routeLabel, stationLabel } from '../routeLabels'

describe('routeLabel', () => {
  it('collapses corridor family when no destination is given', () => {
    expect(routeLabel('valley-cb-n1')).toBe('the valley')
    expect(routeLabel('valley-n1-vc')).toBe('the valley')
    expect(routeLabel('ridge-r1-rc')).toBe('the ridge')
    expect(routeLabel('shortcut-cb-cn')).toBe('the shortcut')
    expect(routeLabel('cross-vn-cn')).toBe('the cross trail')
    expect(routeLabel('mystery-edge')).toBe('mystery-edge')
  })

  it('disambiguates valley edges by destination so live-call choices stay distinct', () => {
    const a = routeLabel('valley-cb-n1', 'valley-n1')
    const b = routeLabel('valley-cb-vc', 'valley-center')
    expect(a).toBe('the valley → valley n1')
    expect(b).toBe('the valley → valley center')
    expect(a).not.toBe(b)
  })

  it('labels known bases in plain English', () => {
    expect(stationLabel('champion-base')).toBe('your base')
    expect(stationLabel('rival-base')).toBe('rival base')
    expect(routeLabel('valley-s3-rb', 'rival-base')).toBe('the valley → rival base')
  })
})

describe('disambiguateRouteLabels', () => {
  it('leaves unique labels alone', () => {
    const options = [
      { edgeId: 'valley-cb-n1', label: 'the valley → valley n1' },
      { edgeId: 'ridge-rn-r1', label: 'the ridge → ridge n1' },
    ]
    expect(disambiguateRouteLabels(options)).toEqual(options)
  })

  it('appends an edge-id hint when labels still collide', () => {
    const options = [
      { edgeId: 'valley-a', label: 'the valley' },
      { edgeId: 'valley-b', label: 'the valley' },
      { edgeId: 'ridge-a', label: 'the ridge' },
    ]
    const result = disambiguateRouteLabels(options)
    expect(result[0].label).toBe('the valley (valley a)')
    expect(result[1].label).toBe('the valley (valley b)')
    expect(result[2].label).toBe('the ridge')
    expect(new Set(result.map(item => item.label)).size).toBe(3)
  })
})
