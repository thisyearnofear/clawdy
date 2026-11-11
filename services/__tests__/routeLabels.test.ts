import { describe, expect, it } from 'vitest'
import { TEMPLATE_STATIONS } from '../arenaCourse'
import { corridorName, disambiguateRouteLabels, routeLabel, stationLabel } from '../routeLabels'

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
    expect(a).toBe('the valley → north upper')
    expect(b).toBe('the valley → mid')
    expect(a).not.toBe(b)
  })

  it('labels known bases in plain English', () => {
    expect(stationLabel('champion-base')).toBe('your base')
    expect(stationLabel('rival-base')).toBe('rival base')
    expect(routeLabel('valley-s3-rb', 'rival-base')).toBe('the valley → rival base')
  })

  it('gives the corridor alone when the sentence already names the destination', () => {
    expect(corridorName('valley-cb-n1')).toBe('the valley')
    expect(corridorName('shortcut-cb-cn')).toBe('the shortcut')
    expect(corridorName('mystery-edge')).toBe('mystery-edge')
  })
})

describe('stationLabel', () => {
  it('never hands the player a raw station id on the shipped course', () => {
    for (const station of TEMPLATE_STATIONS) {
      const label = stationLabel(station.id)
      expect(label, station.id).not.toBe(station.id)
      expect(label, station.id).not.toMatch(/\d/)
      expect(label, station.id).not.toContain('-')
    }
  })

  it('keeps every station on a road distinct, so captions name one place', () => {
    const ids = TEMPLATE_STATIONS.map(station => station.id)
    const labels = ids.map(stationLabel)
    expect(new Set(labels).size).toBe(ids.length)
  })

  it('reads the rungs against their own road and side', () => {
    expect(stationLabel('valley-s1')).toBe('south upper valley road')
    expect(stationLabel('valley-s2')).toBe('south mid valley road')
    expect(stationLabel('valley-s3')).toBe('south lower valley road')
    expect(stationLabel('valley-n1')).toBe('north upper valley road')
    expect(stationLabel('ridge-north')).toBe('north ridge road')
    expect(stationLabel('cross-far')).toBe('far cross trail')
  })

  it('leaves a station that is on no map as the raw id', () => {
    expect(stationLabel('moon-dust')).toBe('moon dust')
    expect(stationLabel('junction')).toBe('junction')
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
