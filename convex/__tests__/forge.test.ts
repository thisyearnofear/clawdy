import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from '../_generated/api'
import schema from '../schema'
import { modules } from '../test.setup'
import { FORGE_CREDITS, FORGE_MESSAGES } from '../../services/forge'

async function makeUser(t: ReturnType<typeof convexTest>, name: string) {
  const userId = await t.run(ctx => ctx.db.insert('users', { name }))
  return { userId, as: t.withIdentity({ subject: `${userId}|s` }) }
}

const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]) // "glTF" header

function tripoFetch(handlers: { create?: () => Response; task?: () => Response; model?: () => Response }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init
    const url = String(input)
    if (url.endsWith('/task')) return handlers.create?.() ?? Response.json({ code: 0, data: { task_id: 'task-1' } })
    if (url.includes('/task/')) return handlers.task?.() ?? Response.json({ data: { status: 'success', output: { pbr_model: 'https://cdn.example/model.glb' } } })
    return handlers.model?.() ?? new Response(GLB)
  })
}

describe('forge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('TRIPO_API_KEY', 'test-key')
    vi.stubEnv('FORGE_PER_ACCOUNT_LIMIT', '2')
    vi.stubEnv('FORGE_GLOBAL_CREDIT_CAP', String(FORGE_CREDITS * 3))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('requires sign-in and valid menu choices before anything is reserved', async () => {
    const t = convexTest(schema, modules)
    const { as } = await makeUser(t, 'Octo')
    vi.stubGlobal('fetch', tripoFetch({}))
    await expect(t.action(api.forge.start, { chassis: 'scout', paint: 'moss' })).rejects.toThrow('sign-in-required')
    await expect(as.action(api.forge.start, { chassis: 'tank', paint: 'moss' })).rejects.toThrow('invalid-chassis')
    await expect(as.action(api.forge.start, { chassis: 'scout', paint: 'make it say hi' })).rejects.toThrow('invalid-paint')
    expect(fetch).not.toHaveBeenCalled()
    expect(await t.run(ctx => ctx.db.query('forges').collect())).toHaveLength(0)
  })

  it('fails safely when the server has no Tripo key, without reserving credits', async () => {
    vi.stubEnv('TRIPO_API_KEY', '')
    const t = convexTest(schema, modules)
    const { as } = await makeUser(t, 'Octo')
    vi.stubGlobal('fetch', tripoFetch({}))
    await expect(as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })).rejects.toThrow('forge-not-configured')
    expect(await t.run(ctx => ctx.db.query('forges').collect())).toHaveLength(0)
  })

  it('forges end to end: reserve, poll Tripo, store the GLB, show it to the owner only', async () => {
    const t = convexTest(schema, modules)
    const a = await makeUser(t, 'Octo')
    const b = await makeUser(t, 'Other')
    const fetchMock = tripoFetch({})
    vi.stubGlobal('fetch', fetchMock)

    const { forgeId } = await a.as.action(api.forge.start, { chassis: 'raider', paint: 'ember' })
    expect((await a.as.query(api.forge.mine, {}))[0]).toMatchObject({ status: 'pending', chassis: 'raider', paint: 'ember', url: null })

    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(6_000))
    const mine = await a.as.query(api.forge.mine, {})
    expect(mine[0]).toMatchObject({ id: forgeId, status: 'ready', error: null })
    expect(mine[0].url).toBeTruthy()
    expect(await b.as.query(api.forge.mine, {})).toEqual([])
    expect(await t.query(api.forge.mine, {})).toEqual([])

    // The key is only ever sent to Tripo, and the prompt comes from the fixed menu.
    const create = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/task'))!
    expect(JSON.parse(String(create[1]?.body)).prompt).toContain('ember orange')
    expect(JSON.stringify(mine)).not.toContain('test-key')
    expect(JSON.stringify(mine)).not.toContain('task-1')
  })

  it('enforces the per-account limit and busy rule', async () => {
    const t = convexTest(schema, modules)
    const { as } = await makeUser(t, 'Octo')
    vi.stubGlobal('fetch', tripoFetch({}))
    await as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })
    await expect(as.action(api.forge.start, { chassis: 'hauler', paint: 'moss' })).rejects.toThrow('forge-busy')
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(6_000))
    await as.action(api.forge.start, { chassis: 'hauler', paint: 'ice' })
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(6_000))
    await expect(as.action(api.forge.start, { chassis: 'raider', paint: 'sand' })).rejects.toThrow('forge-limit-reached')
  })

  it('enforces the global credit cap across accounts and says so clearly', async () => {
    vi.stubEnv('FORGE_GLOBAL_CREDIT_CAP', String(FORGE_CREDITS * 2))
    const t = convexTest(schema, modules)
    vi.stubGlobal('fetch', tripoFetch({}))
    const users = await Promise.all(['A', 'B', 'C'].map(name => makeUser(t, name)))
    await users[0].as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })
    await users[1].as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })
    await expect(users[2].as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })).rejects.toThrow('forge-cap-reached')
    expect(FORGE_MESSAGES['forge-cap-reached']).toMatch(/credit cap/)
  })

  it.each([
    ['Tripo rejects the request', { create: () => Response.json({ code: 1001, message: 'bad' }, { status: 400 }) }, 'tripo-rejected'],
    ['Tripo is out of credits', { create: () => Response.json({ code: 2010 }, { status: 403 }) }, 'tripo-credits'],
  ])('refunds the reservation when %s', async (_name, handlers, code) => {
    const t = convexTest(schema, modules)
    const { as } = await makeUser(t, 'Octo')
    vi.stubGlobal('fetch', tripoFetch(handlers))
    await expect(as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })).rejects.toThrow(code)
    const rows = await t.run(ctx => ctx.db.query('forges').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('failed')
    // The failed row frees both the account and the cap, so the player can try again.
    vi.stubGlobal('fetch', tripoFetch({}))
    await as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })
  })

  it('shows a clear message when the Tripo task fails or times out, and frees the reservation', async () => {
    const t = convexTest(schema, modules)
    const { as } = await makeUser(t, 'Octo')
    vi.stubGlobal('fetch', tripoFetch({ task: () => Response.json({ data: { status: 'failed' } }) }))
    await as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(6_000))
    let mine = await as.query(api.forge.mine, {})
    expect(mine[0]).toMatchObject({ status: 'failed', error: FORGE_MESSAGES['tripo-failed'] })

    vi.stubGlobal('fetch', tripoFetch({ task: () => Response.json({ data: { status: 'running' } }) }))
    await as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })
    vi.setSystemTime(Date.now() + 9 * 60_000)
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(6_000))
    mine = await as.query(api.forge.mine, {})
    expect(mine[0]).toMatchObject({ status: 'failed', error: FORGE_MESSAGES['tripo-timeout'] })
  })

  it('does not let a late poll overwrite a finished forge', async () => {
    const t = convexTest(schema, modules)
    const { as, userId } = await makeUser(t, 'Octo')
    vi.stubGlobal('fetch', tripoFetch({}))
    const { forgeId } = await as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(6_000))
    await t.mutation(internal.forge.failForge, { forgeId, code: 'tripo-failed' })
    const row = await t.run(ctx => ctx.db.get(forgeId))
    expect(row?.status).toBe('ready')
    expect(row?.userId).toBe(userId)
  })
  describe('when a poll dies (scheduled actions are not retried)', () => {
    async function strandedForge(t: ReturnType<typeof convexTest>, userId: never, overrides: Record<string, unknown> = {}) {
      const now = Date.now()
      return await t.run(ctx => ctx.db.insert('forges', {
        userId,
        chassis: 'scout',
        paint: 'moss',
        status: 'pending',
        credits: FORGE_CREDITS,
        taskId: 'task-1',
        createdAt: now - 120_000,
        deadline: now + 300_000,
        ...overrides,
      } as never))
    }

    it('sweep restarts a quiet poll and the forge completes', async () => {
      const t = convexTest(schema, modules)
      const { as, userId } = await makeUser(t, 'Octo')
      vi.stubGlobal('fetch', tripoFetch({}))
      await strandedForge(t, userId as never)
      expect(await t.mutation(internal.forge.sweep, {})).toEqual({ expired: 0, restarted: 1 })
      await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(6_000))
      expect((await as.query(api.forge.mine, {}))[0]).toMatchObject({ status: 'ready', error: null })
    })

    it('sweep leaves a recently polled forge alone, so poll chains do not pile up', async () => {
      const t = convexTest(schema, modules)
      const { userId } = await makeUser(t, 'Octo')
      await strandedForge(t, userId as never, { polledAt: Date.now() - 5_000 })
      expect(await t.mutation(internal.forge.sweep, {})).toEqual({ expired: 0, restarted: 0 })
    })

    it('sweep fails a forge past its deadline and frees the account and the cap', async () => {
      const t = convexTest(schema, modules)
      const { as, userId } = await makeUser(t, 'Octo')
      vi.stubGlobal('fetch', tripoFetch({}))
      await strandedForge(t, userId as never, { deadline: Date.now() - 1_000 })
      expect(await t.mutation(internal.forge.sweep, {})).toEqual({ expired: 1, restarted: 0 })
      expect((await as.query(api.forge.mine, {}))[0]).toMatchObject({ status: 'failed', error: FORGE_MESSAGES['tripo-timeout'] })
      await as.action(api.forge.start, { chassis: 'scout', paint: 'moss' })
    })

    it('a new forge request self-heals an overdue pending one even if the sweep has not run', async () => {
      const t = convexTest(schema, modules)
      const { as, userId } = await makeUser(t, 'Octo')
      vi.stubGlobal('fetch', tripoFetch({}))
      await strandedForge(t, userId as never, { deadline: Date.now() - 1_000 })
      await expect(as.action(api.forge.start, { chassis: 'hauler', paint: 'ice' })).resolves.toMatchObject({ forgeId: expect.any(String) })
      const rows = await t.run(ctx => ctx.db.query('forges').collect())
      expect(rows.map(row => row.status).sort()).toEqual(['failed', 'pending'])
    })

    it('does not restart a forge that has no Tripo task yet', async () => {
      const t = convexTest(schema, modules)
      const { userId } = await makeUser(t, 'Octo')
      await strandedForge(t, userId as never, { taskId: undefined })
      expect(await t.mutation(internal.forge.sweep, {})).toEqual({ expired: 0, restarted: 0 })
    })

    it('finish reports whether it applied, so a duplicate poll can clean up its copy', async () => {
      const t = convexTest(schema, modules)
      const { userId } = await makeUser(t, 'Octo')
      const forgeId = await strandedForge(t, userId as never)
      const storageId = await t.run(ctx => ctx.storage.store(new Blob(['a'])))
      expect(await t.mutation(internal.forge.finish, { forgeId, storageId })).toBe(true)
      const second = await t.run(ctx => ctx.storage.store(new Blob(['b'])))
      expect(await t.mutation(internal.forge.finish, { forgeId, storageId: second })).toBe(false)
    })
  })
})
