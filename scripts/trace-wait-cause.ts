/**
 * scripts/trace-wait-cause.ts — classify every non-transit decision tick:
 * what did the policy propose, what the controller accepted, and WHY it
 * waited (rejection reason, missing legal moves, cooldown, committed
 * return). Separates policy waits from physics stalls on the grounded
 * starter-vs-poach practice match.
 * Usage: npx tsx scripts/trace-wait-cause.ts
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ArenaRunner } from '../services/arenaPolicy'
import { ArenaPhysics } from '../services/arenaPhysics'
import { applyCourseMode } from '../services/arenaCourse'
import { ARENA_RULES } from '../services/arenaEpisode'
import { SEASON_0_STARTER_CHECKPOINT } from '../services/starterCheckpoint'
import { loadGroundedWorld } from './eval-lib'

const HERE = dirname(fileURLToPath(import.meta.url))

async function main() {
  const world = await loadGroundedWorld(join(HERE, '..'))
  const { scenario } = applyCourseMode(world.course, 'practice')
  const runner = new ArenaRunner(
    scenario,
    { champion: { strategy: 'learned', checkpoint: SEASON_0_STARTER_CHECKPOINT }, rival: 'poach' },
    new ArenaPhysics(world.collider),
  )

  // Per-agent consecutive wait-run tracking at decision ticks
  type Run = { agent: string; node: string; from: number; ticks: number; reasons: Map<string, number> }
  const runs: Run[] = []
  const open = new Map<string, Run>()

  const close = (agent: string) => {
    const run = open.get(agent)
    if (run) { runs.push(run); open.delete(agent) }
  }

  while (runner.peek().status !== 'finished') {
    runner.advanceTicks(1)
    const snap = runner.peek()
    if (snap.tick % ARENA_RULES.decisionEveryTicks !== 1) continue
    for (const agent of snap.agents) {
      const last = agent.lastOutcome
      const isWaitTick = !agent.transit && last?.tick === snap.tick - 1 && last.accepted && last.action?.type === 'wait'
      if (isWaitTick) {
        const run = open.get(agent.id)
        if (run && run.node === agent.nodeId) {
          run.ticks += ARENA_RULES.decisionEveryTicks
        } else {
          close(agent.id)
          open.set(agent.id, { agent: agent.id, node: agent.nodeId, from: snap.tick, ticks: ARENA_RULES.decisionEveryTicks, reasons: new Map() })
        }
        // classify why: force decisionDue so availableActions is populated
        const obs = runner.observe(agent.id, { forceDecision: true })
        const moves = obs.availableActions.filter(a => a.type === 'move')
        const reason =
          agent.cooldownUntilTick > snap.tick ? `cooldown(until ${agent.cooldownUntilTick})` :
          moves.length === 0 ? 'no-legal-moves(energy-starved)' :
          obs.resources.length === 0 && agent.cargo > 0 ? 'committed-return-blocked?' :
          'policy-wait'
        const key = `${reason} | moves=${moves.length} res=${obs.resources.length} e=${agent.energy.toFixed(1)} c=${agent.cargo}`
        const r = open.get(agent.id)!
        r.reasons.set(key, (r.reasons.get(key) ?? 0) + 1)
      } else {
        close(agent.id)
      }
    }
  }

  console.log('wait-runs (decision-tick waits at a node, no transit):')
  for (const run of runs.filter(r => r.ticks >= 20).sort((a, b) => b.ticks - a.ticks).slice(0, 20)) {
    console.log(`\n${run.agent} @${run.node} t${run.from}..${run.from + run.ticks} (${run.ticks}t)`)
    for (const [k, n] of [...run.reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
      console.log(`    ${n}x ${k}`)
    }
  }
  console.log(`\ntotal wait-runs ≥20t: ${runs.filter(r => r.ticks >= 20).length}, all: ${runs.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
