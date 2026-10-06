/**
 * Brain vs brain: the trained chassis brains (starter/chassis-*.json) play each
 * other on unseen hidden Rush variants, both sides, each with its own build.
 * Route-only (server-style). Nothing here involves the house bots.
 *
 *   npx tsx scripts/bench-chassis-pvp.ts [variants=40] [--ruleset skirmish] [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildRushCourse } from '../services/arenaCourse'
import { ArenaPhysics } from '../services/arenaPhysics'
import { ArenaRunner } from '../services/arenaPolicy'
import { CHASSIS_IDS, baseBuild, buildToTraits, type ChassisId, type RulesetId } from '../services/chassis'
import { rushVariant, swapSides } from '../services/rushVariants'
import type { PolicyCheckpoint } from '../services/policyModel'
import { loadGroundedWorld } from './eval-lib'

const RULESET: RulesetId | undefined = process.argv.includes('--ruleset') ? 'skirmish' : undefined
const PREFIX = RULESET ? 'skirmish' : 'chassis'
const VARIANTS = Number(process.argv.find(arg => /^\d+$/.test(arg)) ?? 40)

async function main() {
  const root = resolve(import.meta.dirname, '..')
  const world = await loadGroundedWorld(root)
  const probe = new ArenaPhysics(world.collider)
  const base = buildRushCourse(probe).scenario
  probe.dispose()
  const brains = Object.fromEntries(CHASSIS_IDS.map(id => [id, JSON.parse(readFileSync(resolve(root, `starter/${PREFIX}-${id}.json`), 'utf-8')) as PolicyCheckpoint])) as Record<ChassisId, PolicyCheckpoint>

  const result: Record<string, { wins: number; losses: number; draws: number; banked: number; foe: number }> = {}
  for (const row of CHASSIS_IDS) {
    for (const col of CHASSIS_IDS) {
      const cell = { wins: 0, losses: 0, draws: 0, banked: 0, foe: 0 }
      for (let seed = 9001; seed < 9001 + VARIANTS; seed++) {
        const variant = rushVariant(base, 'hidden', seed)
        for (const played of [variant, swapSides(variant)]) {
          const traits = { champion: buildToTraits(baseBuild(row), RULESET), rival: buildToTraits(baseBuild(col), RULESET) }
          const scenario = { ...played, ...(RULESET ? { rulesetId: RULESET } : {}), entrants: played.entrants.map(entrant => ({ ...entrant, traits: traits[entrant.id as 'champion' | 'rival'] })) }
          const runner = new ArenaRunner(scenario, {
            champion: { strategy: 'learned', checkpoint: brains[row] },
            rival: { strategy: 'learned', checkpoint: brains[col] },
          }, undefined, { record: false })
          runner.advanceTicks(scenario.durationTicks)
          const snap = runner.snapshot()
          const a = snap.agents.find(agent => agent.id === 'champion')!.banked
          const b = snap.agents.find(agent => agent.id === 'rival')!.banked
          cell.banked += a
          cell.foe += b
          if (a > b) cell.wins++
          else if (a < b) cell.losses++
          else cell.draws++
        }
      }
      result[`${row}-vs-${col}`] = cell
    }
  }

  console.log(`${VARIANTS} hidden variants x 2 sides = ${VARIANTS * 2} matches per cell. Cell = row brain W-L-D against column brain.`)
  console.log(['row\\col', ...CHASSIS_IDS].map(cell => cell.padEnd(11)).join(' '))
  for (const row of CHASSIS_IDS) {
    console.log([row.padEnd(11), ...CHASSIS_IDS.map(col => {
      const c = result[`${row}-vs-${col}`]
      return `${c.wins}-${c.losses}-${c.draws}`.padEnd(11)
    })].join(' '))
  }
  console.log('\nmean banked (row : column)')
  for (const row of CHASSIS_IDS) {
    console.log([row.padEnd(11), ...CHASSIS_IDS.map(col => {
      const c = result[`${row}-vs-${col}`]
      const n = VARIANTS * 2
      return `${(c.banked / n).toFixed(2)}:${(c.foe / n).toFixed(2)}`.padEnd(11)
    })].join(' '))
  }
  if (process.argv.includes('--write')) {
    writeFileSync(resolve(root, 'docs', RULESET ? 'eval-skirmish-pvp.json' : 'eval-chassis-pvp.json'), JSON.stringify({ variants: VARIANTS, brains: Object.fromEntries(CHASSIS_IDS.map(id => [id, brains[id].id])), result }, null, 2) + '\n', 'utf-8')
    console.log('\nwrote docs/' + (RULESET ? 'eval-skirmish-pvp.json' : 'eval-chassis-pvp.json') + '')
  }
}

main().catch(error => { console.error(error); process.exit(1) })
