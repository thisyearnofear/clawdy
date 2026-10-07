/** Plain-English station name for a node id. */
export function stationLabel(nodeId: string): string {
  if (nodeId === 'champion-base') return 'your base'
  if (nodeId === 'rival-base') return 'rival base'
  return nodeId.replaceAll('-', ' ')
}

function corridorFamily(edgeId: string): string | null {
  if (edgeId.includes('ridge')) return 'the ridge'
  if (edgeId.includes('valley')) return 'the valley'
  if (edgeId.includes('shortcut') || edgeId.includes('diag')) return 'the shortcut'
  if (edgeId.includes('cross')) return 'the cross trail'
  return null
}

/**
 * Readable route name. Pass `destination` (the node the rover will arrive at)
 * when several edges share a corridor family — otherwise every valley edge
 * collapses to "the valley" and live-call choices look identical.
 */
export function routeLabel(edgeId: string, destination?: string): string {
  const family = corridorFamily(edgeId)
  if (destination) {
    const dest = stationLabel(destination)
    return family ? `${family} → ${dest}` : `toward ${dest}`
  }
  return family ?? edgeId
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
