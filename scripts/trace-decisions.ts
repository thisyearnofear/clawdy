/**
 * scripts/trace-decisions.ts — diagnostic: accepted move log for a champion
 * policy on the grounded practice match. Pass 'distilled' to trace the
 * eval-pipeline distilled checkpoint instead of the bundled starter.
 * Usage: npx tsx scripts/trace-decisions.ts [distilled]
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ArenaRunner } from '../services/arenaPolicy'
import { ArenaPhysics } from '../services/arenaPhysics'
import { applyCourseMode } from '../services/arenaCourse'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import { buildSyllabusExamples, loadGroundedWorld, trainDistilledCheckpoint } from './eval-lib'

const HERE = dirname(fileURLToPath(import.meta.url))

async function main() {
  const world = await loadGroundedWorld(join(HERE, '..'))
  const { scenario } = applyCourseMode(world.course, 'practice')
  let checkpoint = SEASON_0_STARTER_CHECKPOINT
  if (process.argv[2] === 'distilled') {
    const deep = applyCourseMode(world.course, 'practice-deep')
    const examples = buildSyllabusExamples([
      { scenario: scenario, collider: world.collider },
      { scenario: deep.scenario, collider: world.collider },
    ])
    checkpoint = trainDistilledCheckpoint(examples)
    console.log(`distilled checkpoint: ${examples.length} examples`)
  }
  const motion = new ArenaPhysics(world.collider)
  const runner = new ArenaRunner(
    scenario,
    { champion: { strategy: 'learned', checkpoint }, rival: 'greedy' },
    motion,
  )
  const moves: string[] = []
  let lastOutcomeTick = -1
  while (runner.snapshot().status !== 'finished') {
    runner.advanceTicks(1)
    const snap = runner.snapshot()
    const champ = snap.agents.find(a => a.id === 'champion')!
    const outcome = champ.lastOutcome
    if (outcome?.action && outcome.tick !== lastOutcomeTick && outcome.action.type === 'move' && outcome.accepted) {
      lastOutcomeTick = outcome.tick
      moves.push(`t${outcome.tick}:${champ.nodeId ?? '?'}-${(outcome.action as { edgeId: string }).edgeId}`)
    }
  }
  motion.dispose()
  const final = runner.snapshot()
  const champ = final.agents.find(a => a.id === 'champion')!
  console.log(`champion banked=${champ.banked} rec=${champ.recoveries}`)
  console.log(moves.join('\n'))
}

main().catch(e => { console.error(e); process.exit(1) })
