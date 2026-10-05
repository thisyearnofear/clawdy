/**
 * Does the chassis choice matter, and does any chassis dominate? Both sides
 * run the SAME house policy so only the chassis differs, on jittered Rush
 * variants with sides swapped. Route-only, so it is a server-match result.
 *
 *   npx tsx scripts/bench-chassis.ts [variants=12]
 */
import { resolve } from 'node:path'
import { ArenaRunner, type CollectorStrategy } from '../services/arenaPolicy'
import { ArenaPhysics } from '../services/arenaPhysics'
import { buildRushCourse } from '../services/arenaCourse'
import { rushVariant, swapSides } from '../services/rushVariants'
import { CHASSIS_IDS, baseBuild, buildToTraits, type ChassisId } from '../services/chassis'
import type { ArenaScenario } from '../services/arenaEpisode'
import { loadGroundedWorld } from './eval-lib'

const POLICIES: CollectorStrategy[] = ['safe', 'greedy', 'poach']
const VARIANTS = Number(process.argv[2] ?? 12)

function play(scenario: ArenaScenario, policy: CollectorStrategy, champion: ChassisId, rival: ChassisId) {
  const traits = { champion: buildToTraits(baseBuild(champion)), rival: buildToTraits(baseBuild(rival)) }
  const withTraits: ArenaScenario = {
    ...scenario,
    entrants: scenario.entrants.map(entrant => ({ ...entrant, traits: traits[entrant.id as 'champion' | 'rival'] })),
  }
  const runner = new ArenaRunner(withTraits, { champion: policy, rival: policy })
  runner.advanceTicks(withTraits.durationTicks)
  const snap = runner.snapshot()
  const a = snap.agents.find(agent => agent.id === 'champion')!.banked
  const b = snap.agents.find(agent => agent.id === 'rival')!.banked
  return { a, b }
}

async function main() {
  const world = await loadGroundedWorld(resolve(import.meta.dirname, '..'))
  const probe = new ArenaPhysics(world.collider)
  const base = buildRushCourse(probe).scenario
  probe.dispose()

  const scenarios: ArenaScenario[] = []
  for (let seed = 1; seed <= VARIANTS; seed++) {
    const variant = rushVariant(base, 'hidden', seed)
    scenarios.push(variant, swapSides(variant))
  }

  console.log(`variants=${VARIANTS} (x2 sides). Cell = row chassis points share vs column (>50% means row wins).`)
  for (const policy of POLICIES) {
    console.log(`\npolicy=${policy}`)
    const header = ['row\\col', ...CHASSIS_IDS].map(cell => cell.padEnd(8)).join(' ')
    console.log(header)
    const totals = Object.fromEntries(CHASSIS_IDS.map(id => [id, { banked: 0, games: 0, wins: 0 }])) as Record<ChassisId, { banked: number; games: number; wins: number }>
    for (const row of CHASSIS_IDS) {
      const cells: string[] = []
      for (const col of CHASSIS_IDS) {
        let rowPts = 0
        let colPts = 0
        let rowWins = 0
        let decided = 0
        for (const scenario of scenarios) {
          const { a, b } = play(scenario, policy, row, col)
          rowPts += a
          colPts += b
          if (a !== b) { decided++; if (a > b) rowWins++ }
          if (row !== col) {
            totals[row].banked += a
            totals[row].games++
            if (a > b) totals[row].wins++
          }
        }
        const share = rowPts + colPts === 0 ? 50 : (100 * rowPts) / (rowPts + colPts)
        cells.push(`${share.toFixed(0)}%/${decided === 0 ? '-' : Math.round((100 * rowWins) / decided)}w`.padEnd(8))
      }
      console.log([row.padEnd(8), ...cells].join(' '))
    }
    console.log('mirror-excluded win rate: ' + CHASSIS_IDS.map(id => `${id}=${totals[id].games ? ((100 * totals[id].wins) / totals[id].games).toFixed(0) : '-'}%`).join('  '))
  }
}

main().catch(error => { console.error(error); process.exit(1) })
