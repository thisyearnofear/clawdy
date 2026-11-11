/**
 * Player-facing place names.
 *
 * Shipped course ids are `<road>-<position>`, and the position tokens carry their
 * own grammar: `n` and `n1` are different stations, and `n1` and `s1` are rungs of
 * opposite sides, so a numbered rung keeps its side word (`north upper valley road`)
 * instead of collapsing onto `ridge-north` (`north ridge road`). A station that
 * exists on no map stays as the raw id — inventing a name for a place the player
 * cannot find would be worse than showing the internal one.
 */
const ROAD_WORDS: Record<string, string> = {
  valley: 'valley road',
  ridge: 'ridge road',
  cross: 'cross trail',
}

const CARDINAL_WORDS: Record<string, string> = {
  north: 'north',
  n: 'north',
  center: 'mid',
  c: 'mid',
  mid: 'mid',
  s: 'south',
  south: 'south',
  far: 'far',
}

const SIDE_WORDS: Record<string, string> = { n: 'north', s: 'south' }

/**
 * How many numbered rungs each road carries on each side, so `s1` and `s3` are
 * named against their own road instead of a guessed scale. Mirrored from
 * `TEMPLATE_STATIONS` in `services/arenaCourse.ts` — importing that module here
 * would drag Rapier and three into every caption, so `routeLabels.test.ts` proves
 * the two stay in step instead.
 */
const RUNG_COUNTS: Record<string, number> = {
  'valley-n': 1,
  'valley-s': 3,
  'ridge-n': 1,
  'ridge-s': 3,
  'cross-s': 2,
}

/** `{ roadId, stretch }` for a known station, or null when the id is on no map. */
function parseStation(nodeId: string): { roadId: string; stretch: string } | null {
  if (nodeId === 'champion-base') return null
  if (nodeId === 'rival-base') return null
  const separator = nodeId.lastIndexOf('-')
  if (separator < 0) return null
  const roadId = nodeId.slice(0, separator)
  if (!ROAD_WORDS[roadId]) return null
  const position = nodeId.slice(separator + 1)
  const cardinal = CARDINAL_WORDS[position]
  if (cardinal) return { roadId, stretch: cardinal }
  const rung = /^([ns])(\d+)$/.exec(position)
  if (rung) {
    const count = RUNG_COUNTS[`${roadId}-${rung[1]}`] ?? 0
    return { roadId, stretch: `${SIDE_WORDS[rung[1]]} ${ordinalFromStart(Number(rung[2]), count)}` }
  }
  return null
}

function ordinalFromStart(index: number, count: number): string {
  if (index > count) return 'lower'
  if (count < 2) return 'upper'
  if (index === 1) return 'upper'
  if (index === count) return 'lower'
  const middle = Math.ceil((count + 1) / 2)
  if (index === middle) return 'mid'
  return index < middle ? 'upper' : 'lower'
}

/** Plain-English station name for a node id. */
export function stationLabel(nodeId: string): string {
  if (nodeId === 'champion-base') return 'your base'
  if (nodeId === 'rival-base') return 'rival base'
  const station = parseStation(nodeId)
  if (station) return `${station.stretch} ${ROAD_WORDS[station.roadId]}`
  return nodeId.replaceAll('-', ' ')
}

/** The position words alone — "north upper", "mid", "far". */
function stationStretch(nodeId: string): string | null {
  return parseStation(nodeId)?.stretch ?? null
}

function corridorFamily(edgeId: string): string | null {
  if (edgeId.includes('ridge')) return 'the ridge'
  if (edgeId.includes('valley')) return 'the valley'
  if (edgeId.includes('shortcut') || edgeId.includes('diag')) return 'the shortcut'
  if (edgeId.includes('cross')) return 'the cross trail'
  return null
}

/**
 * The corridor alone, for a sentence that already names the destination —
 * "heading to your base via the valley", never "…to your base via the valley →
 * your base". Falls back to the full label for an edge on no known corridor.
 */
export function corridorName(edgeId: string): string {
  return corridorFamily(edgeId) ?? routeLabel(edgeId)
}

const FAMILY_ROADS: Record<string, string> = {
  'the valley': 'valley',
  'the ridge': 'ridge',
  'the cross trail': 'cross',
}

/**
 * Readable route name. Pass `destination` (the node the rover will arrive at)
 * when several edges share a corridor family — otherwise every valley edge
 * collapses to "the valley" and live-call choices look identical. When the
 * destination sits on the corridor being taken, naming the stretch is enough:
 * "the valley → north upper" beats "the valley → north upper valley road".
 */
export function routeLabel(edgeId: string, destination?: string): string {
  const family = corridorFamily(edgeId)
  if (!destination) return family ?? edgeId
  const stretch = stationStretch(destination)
  if (family && stretch && FAMILY_ROADS[family] === parseStation(destination)?.roadId) {
    return `${family} → ${stretch}`
  }
  const dest = stationLabel(destination)
  return family ? `${family} → ${dest}` : `toward ${dest}`
}

/**
 * When two options still share a label after destination-aware naming, append a
 * short edge-id hint so the player always sees distinct choices.
 */
export function disambiguateRouteLabels<T extends { edgeId: string; label: string }>(options: T[]): T[] {
  const counts = new Map<string, number>()
  for (const option of options) counts.set(option.label, (counts.get(option.label) ?? 0) + 1)
  if ([...counts.values()].every(count => count <= 1)) return options
  return options.map(option => {
    if ((counts.get(option.label) ?? 0) <= 1) return option
    const hint = option.edgeId.replaceAll('-', ' ')
    return { ...option, label: `${option.label} (${hint})` }
  })
}
