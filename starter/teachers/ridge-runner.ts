import type { Teacher } from '../../services/teacher'

/**
 * A teacher is just a function from what the rover sees to what it does.
 * This one banks, collects, then prefers dry (non-floodable) routes toward a core
 * (or home when carrying).
 */
const ridgeRunner: Teacher = observation => {
  const options = observation.availableActions
  const bank = options.find(action => action.type === 'bank')
  if (bank) return bank
  const collect = options.find(action => action.type === 'collect')
  if (collect) return collect

  const moves = options.flatMap(action => {
    if (action.type !== 'move') return []
    const edge = observation.edges.find(candidate => candidate.id === action.edgeId)
    return edge ? [{ action, edge }] : []
  })
  const here = observation.self.nodeId
  const goal = observation.self.cargo > 0 ? observation.self.baseNode : null
  const score = ({ edge }: (typeof moves)[number]) => {
    const target = edge.from === here ? edge.to : edge.from
    const hasCore = observation.resources.some(resource => resource.nodeId === target && resource.available)
    return (target === goal ? 4 : 0) + (hasCore ? 3 : 0) + (edge.floodable ? -2 : 0) - edge.currentTravelTicks / 100
  }
  const best = [...moves].sort((a, b) => score(b) - score(a))[0]
  return best ? best.action : { type: 'wait' }
}

export default ridgeRunner
