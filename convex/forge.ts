import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import { internal } from './_generated/api'
import { action, internalAction, internalMutation, internalQuery, query } from './_generated/server'
import {
  FORGE_CREDITS,
  FORGE_MESSAGES,
  FORGE_NEGATIVE_PROMPT,
  FORGE_POLL_MS,
  FORGE_TIMEOUT_MS,
  buildForgePrompt,
  classifyTripoFailure,
  decideForge,
  forgeLimits,
  isForgeChassis,
  isForgePaint,
  type ForgeErrorCode,
} from '../services/forge'

/**
 * Forge your champion. The Tripo key is read from the Convex environment only and
 * never reaches the client. The player picks a chassis and a paint from fixed menus;
 * the prompt is built here. Credits are reserved atomically before Tripo is called
 * and refunded on every failure path, so the per-account limit and the global cap
 * hold even under concurrent requests.
 *
 * Env: TRIPO_API_KEY (required), FORGE_PER_ACCOUNT_LIMIT, FORGE_GLOBAL_CREDIT_CAP.
 */
const TRIPO_API = 'https://api.tripo3d.ai/v2/openapi'
const MODEL_VERSION = 'P1-20260311'
const MAX_MODEL_BYTES = 16 * 1024 * 1024

function fail(code: ForgeErrorCode): never {
  throw new ConvexError(code)
}

export const reserve = internalMutation({
  args: { userId: v.id('users'), chassis: v.string(), paint: v.string() },
  handler: async (ctx, args) => {
    const mine = await ctx.db.query('forges').withIndex('by_user', q => q.eq('userId', args.userId)).collect()
    const live = await Promise.all(['pending', 'ready'].map(status => ctx.db.query('forges').withIndex('by_status', q => q.eq('status', status as 'pending' | 'ready')).collect()))
    const decision = decideForge(
      {
        accountPending: mine.filter(row => row.status === 'pending').length,
        accountCounted: mine.filter(row => row.status !== 'failed').length,
        globalReserved: live.flat().reduce((sum, row) => sum + row.credits, 0),
      },
      forgeLimits({ FORGE_PER_ACCOUNT_LIMIT: process.env.FORGE_PER_ACCOUNT_LIMIT, FORGE_GLOBAL_CREDIT_CAP: process.env.FORGE_GLOBAL_CREDIT_CAP }),
    )
    if (!decision.ok) fail(decision.code)
    const now = Date.now()
    return await ctx.db.insert('forges', {
      userId: args.userId,
      chassis: args.chassis,
      paint: args.paint,
      status: 'pending',
      credits: FORGE_CREDITS,
      createdAt: now,
      deadline: now + FORGE_TIMEOUT_MS,
    })
  },
})

export const attachTask = internalMutation({
  args: { forgeId: v.id('forges'), taskId: v.string() },
  handler: async (ctx, { forgeId, taskId }) => {
    await ctx.db.patch(forgeId, { taskId })
  },
})

export const finish = internalMutation({
  args: { forgeId: v.id('forges'), storageId: v.id('_storage') },
  handler: async (ctx, { forgeId, storageId }) => {
    const row = await ctx.db.get(forgeId)
    if (!row || row.status !== 'pending') return
    await ctx.db.patch(forgeId, { status: 'ready', storageId, completedAt: Date.now() })
  },
})

/** Marking a forge failed releases its reservation: the cap and per-account sums only count pending + ready rows. */
export const failForge = internalMutation({
  args: { forgeId: v.id('forges'), code: v.string() },
  handler: async (ctx, { forgeId, code }) => {
    const row = await ctx.db.get(forgeId)
    if (!row || row.status !== 'pending') return
    await ctx.db.patch(forgeId, { status: 'failed', errorCode: code, completedAt: Date.now() })
  },
})

export const get = internalQuery({
  args: { forgeId: v.id('forges') },
  handler: async (ctx, { forgeId }) => await ctx.db.get(forgeId),
})

export const start = action({
  args: { chassis: v.string(), paint: v.string() },
  returns: v.object({ forgeId: v.id('forges') }),
  handler: async (ctx, args): Promise<{ forgeId: import('./_generated/dataModel').Id<'forges'> }> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) fail('sign-in-required')
    if (!isForgeChassis(args.chassis)) fail('invalid-chassis')
    if (!isForgePaint(args.paint)) fail('invalid-paint')
    const key = process.env.TRIPO_API_KEY
    if (!key) fail('forge-not-configured')

    const forgeId = await ctx.runMutation(internal.forge.reserve, { userId, chassis: args.chassis, paint: args.paint })

    let code: ForgeErrorCode | undefined
    try {
      const response = await fetch(`${TRIPO_API}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          type: 'text_to_model',
          model_version: MODEL_VERSION,
          prompt: buildForgePrompt(args.chassis, args.paint),
          negative_prompt: FORGE_NEGATIVE_PROMPT,
          face_limit: 8000,
          texture: true,
          pbr: true,
          texture_quality: 'standard',
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { code?: number; data?: { task_id?: string } }
      if (!response.ok || body.code !== 0 || !body.data?.task_id) {
        code = classifyTripoFailure({ httpStatus: response.status, apiCode: body.code })
      } else {
        await ctx.runMutation(internal.forge.attachTask, { forgeId, taskId: body.data.task_id })
        await ctx.scheduler.runAfter(FORGE_POLL_MS, internal.forge.poll, { forgeId })
      }
    } catch {
      code = 'tripo-rejected'
    }
    if (code) {
      await ctx.runMutation(internal.forge.failForge, { forgeId, code })
      fail(code)
    }
    return { forgeId }
  },
})

export const poll = internalAction({
  args: { forgeId: v.id('forges') },
  handler: async (ctx, { forgeId }) => {
    const row = await ctx.runQuery(internal.forge.get, { forgeId })
    if (!row || row.status !== 'pending' || !row.taskId) return
    const key = process.env.TRIPO_API_KEY
    if (!key) {
      await ctx.runMutation(internal.forge.failForge, { forgeId, code: 'forge-not-configured' })
      return
    }
    if (Date.now() > row.deadline) {
      await ctx.runMutation(internal.forge.failForge, { forgeId, code: 'tripo-timeout' })
      return
    }

    let task: { status?: string; output?: { pbr_model?: string; model?: string; base_model?: string } } | undefined
    try {
      const response = await fetch(`${TRIPO_API}/task/${row.taskId}`, { headers: { Authorization: `Bearer ${key}` } })
      task = ((await response.json()) as { data?: typeof task }).data
    } catch {
      // A dropped poll is retried below until the deadline.
    }

    const status = task?.status
    if (status === 'success') {
      const url = task?.output?.pbr_model ?? task?.output?.model ?? task?.output?.base_model
      if (!url) {
        await ctx.runMutation(internal.forge.failForge, { forgeId, code: 'tripo-failed' })
        return
      }
      const download = await fetch(url)
      const bytes = download.ok ? await download.arrayBuffer() : undefined
      if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_MODEL_BYTES) {
        await ctx.runMutation(internal.forge.failForge, { forgeId, code: 'tripo-failed' })
        return
      }
      const storageId = await ctx.storage.store(new Blob([bytes], { type: 'model/gltf-binary' }))
      await ctx.runMutation(internal.forge.finish, { forgeId, storageId })
      return
    }
    if (status && ['failed', 'cancelled', 'banned', 'expired', 'unknown'].includes(status)) {
      await ctx.runMutation(internal.forge.failForge, { forgeId, code: classifyTripoFailure({ taskStatus: status }) })
      return
    }
    await ctx.scheduler.runAfter(FORGE_POLL_MS, internal.forge.poll, { forgeId })
  },
})

/** The signed-in player's forges, newest first. Never exposes other accounts, task ids, or the key. */
export const mine = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const rows = await ctx.db.query('forges').withIndex('by_user', q => q.eq('userId', userId)).order('desc').take(10)
    return await Promise.all(rows.map(async row => ({
      id: row._id,
      chassis: row.chassis,
      paint: row.paint,
      status: row.status,
      createdAt: row.createdAt,
      url: row.storageId ? await ctx.storage.getUrl(row.storageId) : null,
      error: row.errorCode ? (FORGE_MESSAGES[row.errorCode as ForgeErrorCode] ?? 'The forge failed.') : null,
    })))
  },
})
