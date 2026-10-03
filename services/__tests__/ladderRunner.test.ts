import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LADDER_OPPONENTS,
  MAX_CHECKPOINT_JSON_BYTES,
  buildLadderContext,
  ladderScore,
  ladderSeeds,
  parseSubmission,
  runLadder,
} from '../ladderRunner'
import { exportCheckpointJson } from '../checkpointStorage'
import { SEASON_0_STARTER_CHECKPOINT } from '../starterCheckpoint'

const collider = () => new Uint8Array(readFileSync(resolve(process.cwd(), 'public/terrain/sandstone-basin.glb')))

describe('ladder scoring', () => {
  const even = (opponent: (typeof LADDER_OPPONENTS)[number], wins: number, losses: number) => ({ opponent, matches: 12, wins, losses })

  it('is 0 for an even record, +100 for a sweep and -100 for a shutout', () => {
    expect(ladderScore(LADDER_OPPONENTS.map(opponent => even(opponent, 6, 6)))).toBe(0)
    expect(ladderScore(LADDER_OPPONENTS.map(opponent => even(opponent, 12, 0)))).toBe(100)
    expect(ladderScore(LADDER_OPPONENTS.map(opponent => even(opponent, 0, 12)))).toBe(-100)
  })

  it('weights the hard opponents double', () => {
    const beatSafeOnly = ladderScore([even('safe', 12, 0), even('greedy', 0, 12)])
    const beatGreedyOnly = ladderScore([even('safe', 0, 12), even('greedy', 12, 0)])
    expect(beatSafeOnly).toBeGreaterThan(0)
    expect(beatGreedyOnly).toBeLessThan(0)
  })
})

describe('submission intake', () => {
  it('accepts an exported checkpoint and rejects junk or oversized bodies', () => {
    expect(parseSubmission(exportCheckpointJson(SEASON_0_STARTER_CHECKPOINT)).id).toBe(SEASON_0_STARTER_CHECKPOINT.id)
    expect(() => parseSubmission('not json')).toThrow('Invalid JSON')
    expect(() => parseSubmission('{"id":"x"}')).toThrow('not a valid')
    expect(() => parseSubmission(' '.repeat(MAX_CHECKPOINT_JSON_BYTES + 1))).toThrow('too large')
  })

  it('derives distinct seeds from a base', () => {
    expect(ladderSeeds(10, 3)).toEqual([10, 11, 12])
  })
})

describe('server-side ladder run', () => {
  it('refuses terrain that is not the pinned collider', async () => {
    const bytes = collider()
    bytes[bytes.length - 1] ^= 0xff
    await expect(buildLadderContext(bytes)).rejects.toThrow('terrain hash mismatch')
  })

  it('replays deterministically and reports every house opponent', async () => {
    const context = await buildLadderContext(collider())
    const seeds = ladderSeeds(424242, 1)
    const first = runLadder(SEASON_0_STARTER_CHECKPOINT, context, seeds)
    const second = runLadder(SEASON_0_STARTER_CHECKPOINT, context, seeds)
    expect(second).toEqual(first)
    expect(first.perOpponent.map(result => result.opponent)).toEqual([...LADDER_OPPONENTS])
    expect(first.perOpponent.every(result => result.matches === 2)).toBe(true)
    expect(first.score).toBeGreaterThanOrEqual(-100)
    expect(first.score).toBeLessThanOrEqual(100)
    expect(first.seeds).toEqual(seeds)
  }, 60_000)
})
