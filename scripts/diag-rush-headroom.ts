/**
 * Headroom probe, not a product policy: how much does wave-aware staging buy
 * on Rush, when it must still pass through the shared controller rules?
 *
 *   npx tsx scripts/diag-rush-headroom.ts [--variants 25] [--lead 30] [--grace 60]
 */
import { resolve } from 'node:path'

import { ArenaEpisode, ARENA_RULES, type ArenaAction, type ArenaObservation } from '../services/arenaEpisode'
import { buildRushCourse, RUSH_CORE_STATION, RUSH_WAVE_TICKS } from '../services/arenaCourse'
import { ArenaPhysics } from '../services/arenaPhysics'
import { applyControllerRules } from '../services/arenaControllerRules'
import { collectorPolicy, findArenaRoute, type CollectorStrategy } from '../services/arenaPolicy'
import { createLearnedPolicy } from '../services/policyModel'
import { rushVariant, swapSides } from '../services/rushVariants'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import { loadGroundedWorld } from './eval-lib'

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : Number(process.argv[index + 1])
}
const LEAD = arg('lead', 30)
const GRACE = arg('grace', 60)
const WAVE_JITTER = 60

type Policy = (observation: ArenaObservation) => ArenaAction

/** Weather baseline plus wave staging: bank before a wave, wait empty at the centre. */
function waveAware(observation: ArenaObservation): ArenaAction {
  const base = collectorPolicy(observation, 'weather')
  if (!observation.decisionDue || observation.self.transit) return base
  const centre = findArenaRoute(observation, RUSH_CORE_STATION.id, 'safe')
  if (!centre) return base
  const tick = observation.tick
  const windowOpen = RUSH_WAVE_TICKS.some(wave => tick >= wave - WAVE_JITTER - centre.cost - LEAD && tick <= wave + WAVE_JITTER + GRACE)
  if (!windowOpen) return base
  const mother = observation.resources.find(resource => resource.available && resource.nodeId === RUSH_CORE_STATION.id && resource.value === ARENA_RULES.capacity)
  const self = observation.self
  let proposed: ArenaAction
  if (self.cargo > 0) {
    const home = findArenaRoute(observation, self.baseNode, 'safe')
    proposed = home?.firstEdge ? { type: 'move', edgeId: home.firstEdge } : base
  } else if (self.nodeId === RUSH_CORE_STATION.id) {
    proposed = mother ? (observation.availableActions.find(a => a.type === 'collect') ?? { type: 'wait' }) : { type: 'wait' }
  } else {
    proposed = centre.firstEdge ? { type: 'move', edgeId: centre.firstEdge } : base
  }
  return applyControllerRules(observation, proposed)
}

function play(scenario: ReturnType<typeof rushVariant>, champion: Policy, rival: Policy) {
  const entrants = scenario.entrants.map(entrant => ({ ...entrant, policyVersion: 'baseline.probe.v2' }))
  const episode = new ArenaEpisode({ ...scenario, entrants }, undefined, { record: false })
  const policies = new Map<string, Policy>([['champion', champion], ['rival', rival]])
  while (!episode.finished) {
    const tick = episode.tick
    const requests = tick % ARENA_RULES.decisionEveryTicks === 0
      ? [...policies].map(([agentId, policy]) => ({ agentId, tick, action: policy(episode.observe(agentId)) }))
      : []
    episode.step(requests)
  }
  const snap = episode.snapshot()
  return {
    own: snap.agents.find(agent => agent.id === 'champion')!.banked,
    foe: snap.agents.find(agent => agent.id === 'rival')!.banked,
  }
}

async function main() {
  const repoRoot = resolve(import.meta.dirname, '..')
  const variants = arg('variants', 25)
  const world = await loadGroundedWorld(repoRoot)
  const probe = new ArenaPhysics(world.collider)
  const rushBase = buildRushCourse(probe).scenario
  probe.dispose()

  const baseline = (strategy: CollectorStrategy): Policy => observation => collectorPolicy(observation, strategy)
  const field: [string, Policy][] = [
    ['safe', baseline('safe')],
    ['greedy', baseline('greedy')],
    ['weather', baseline('weather')],
    ['starter', createLearnedPolicy(SEASON_0_STARTER_CHECKPOINT)],
  ]
  console.log(`wave-aware (lead ${LEAD}, grace ${GRACE}) vs field, ${variants} hidden variants x 2 sides`)
  for (const [label, rival] of field) {
    let margin = 0, wins = 0, losses = 0, matches = 0, own = 0, foe = 0
    for (let seed = 9001; seed < 9001 + variants; seed++) {
      const scenario = rushVariant(rushBase, 'hidden', seed)
      for (const played of [scenario, swapSides(scenario)]) {
        const result = play(played, waveAware, rival)
        own += result.own; foe += result.foe; margin += result.own - result.foe
        if (result.own > result.foe) wins++
        else if (result.own < result.foe) losses++
        matches++
      }
    }
    console.log(`  vs ${label.padEnd(8)} banked ${(own / matches).toFixed(2)} : ${(foe / matches).toFixed(2)}  margin ${(margin / matches).toFixed(2).padStart(6)}  W-L ${wins}-${losses}`)
  }
}

main().catch(error => { console.error(error); process.exit(1) })
