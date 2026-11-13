import { afterEach, assert, mockHost, mountWorker, test } from 'orca/testing'
import { CACHE_TTL, emptyUsage, today } from './data'
import { example } from './fixture'
import * as main from './worker'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

const profile = { id: 'id', username: 'alexesprit', streak: 67 }
const feed = () => ({
  posts: [{ daily_usage: { date: today(), cost_usd: 12.34 } }],
})
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 })

test('refreshes both endpoints once, reuses cache, forces refresh, and falls back offline', async () => {
  const calls: string[] = []
  let offline = false
  globalThis.fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    if (offline) throw new Error('Offline')
    return json(url.includes('/users/') ? profile : feed())
  }
  const host = mockHost({ settings: { username: 'alexesprit' } })
  const worker = await mountWorker(main, { host })
  try {
    const first = await worker.request('usage.get')
    assert.equal(first.snapshot?.usage.cost, 12.34)
    assert.equal(calls.length, 2)
    await worker.request('usage.get')
    assert.equal(calls.length, 2)
    await worker.request('usage.get', { force: true })
    assert.equal(calls.length, 4)
    offline = true
    const cached = await worker.request('usage.get', { force: true })
    assert.equal(cached.stale, true)
    assert.equal(cached.snapshot?.usage.cost, 12.34)
    assert.ok(cached.error.includes('Offline'))
    assert.deepEqual(worker.refusals, [])
  } finally {
    await worker.deactivate()
  }
})

test('uses cached profile ID if only the profile request fails', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/users/')) throw new Error('Profile offline')
    return json(feed())
  }
  const snapshot = {
    ...example.snapshot,
    fetchedAt: Date.now() - CACHE_TTL - 1,
  }
  const host = mockHost({
    settings: { username: 'alexesprit' },
    storage: { snapshotV1: snapshot },
  })
  const worker = await mountWorker(main, { host })
  try {
    const result = await worker.request('usage.get')
    assert.equal(result.snapshot?.usage.cost, 12.34)
    assert.equal(result.stale, true)
    assert.match(result.error, /cached profile/)
  } finally {
    await worker.deactivate()
  }
})

test('does not reuse another username’s cache and does not fetch before configuration', async () => {
  const calls: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    return new Response('Unavailable', { status: 503 })
  }
  const host = mockHost({ storage: { snapshotV1: example.snapshot } })
  const worker = await mountWorker(main, { host })
  try {
    assert.equal((await worker.request('usage.get')).snapshot, null)
    assert.equal(calls.length, 0)
    const result = await worker.request('usage.configure', {
      username: ' @other ',
    })
    assert.equal(result.username, 'other')
    assert.equal(result.snapshot, null)
    assert.match(result.error, /503/)
    assert.equal(host.data().settings.username, 'other')
  } finally {
    await worker.deactivate()
  }
})

test('does not display yesterday’s cached spend when Straude is offline', async () => {
  globalThis.fetch = async () => {
    throw new Error('Offline')
  }
  const snapshot = {
    ...example.snapshot,
    usage: { ...emptyUsage('2020-01-01'), cost: 99 },
  }
  const host = mockHost({
    settings: { username: 'alexesprit' },
    storage: { snapshotV1: snapshot },
  })
  const worker = await mountWorker(main, { host })
  try {
    const result = await worker.request('usage.get')
    assert.equal(result.snapshot?.usage.cost, 0)
    assert.equal(result.snapshot?.usage.date, today())
    assert.equal(result.stale, true)
  } finally {
    await worker.deactivate()
  }
})

test('schedules every supported refresh interval, defaults safely, and clears its timer on shutdown', async () => {
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  try {
    for (const value of [5, 15, 30, 60, 7, '15']) {
      let delay = 0
      let cleared = false
      globalThis.setInterval = ((_callback: TimerHandler, ms?: number) => {
        delay = ms ?? 0
        return 123
      }) as typeof setInterval
      globalThis.clearInterval = (id) => {
        if (id === 123) cleared = true
      }
      const host = mockHost({ settings: { refreshIntervalMinutes: value } })
      const worker = await mountWorker(main, { host })
      try {
        assert.equal(
          delay,
          (typeof value === 'number' && value !== 7 ? value : 5) * 60_000,
        )
      } finally {
        await worker.deactivate()
      }
      assert.equal(cleared, true)
    }
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
})

test('updates interval and cache lifetime live while manual refresh still bypasses the cache', async () => {
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  let delay = 0
  let fetches = 0
  let api!: import('orca/worker').OrcaWorkerApi
  globalThis.setInterval = ((_callback: TimerHandler, ms?: number) => {
    delay = ms ?? 0
    return 123
  }) as typeof setInterval
  globalThis.clearInterval = () => {}
  globalThis.fetch = async (input) => {
    fetches++
    return json(String(input).includes('/users/') ? profile : feed())
  }
  const snapshot = { ...example.snapshot, fetchedAt: Date.now() - 10 * 60_000 }
  const host = mockHost({
    settings: { username: 'alexesprit', refreshIntervalMinutes: 15 },
    storage: { snapshotV1: snapshot },
  })
  const worker = await mountWorker(
    {
      default: async (value) => {
        api = value
        await main.default(value)
      },
      deactivate: main.deactivate,
    },
    { host },
  )
  try {
    await worker.request('usage.get')
    assert.equal(fetches, 0)
    assert.equal(delay, 15 * 60_000)
    await api.settings.set('refreshIntervalMinutes', 5)
    await worker.request('usage.get')
    assert.equal(delay, 5 * 60_000)
    assert.equal(fetches, 2)
    await api.settings.set('refreshIntervalMinutes', 60)
    await worker.request('usage.get')
    assert.equal(delay, 60 * 60_000)
    assert.equal(fetches, 2)
    await worker.request('usage.get', { force: true })
    assert.equal(fetches, 4)
    assert.deepEqual(worker.refusals, [])
  } finally {
    await worker.deactivate()
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
})

test('each scheduled tick fetches even when network latency leaves the cache younger than the interval', async () => {
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  const originalNow = Date.now
  let now = originalNow()
  const start = now
  let tick = () => {}
  let fetches = 0
  globalThis.setInterval = ((callback: () => void) => {
    tick = callback
    return 123
  }) as typeof setInterval
  globalThis.clearInterval = () => {}
  Date.now = () => now
  globalThis.fetch = async (input) => {
    fetches++
    now += 500
    return json(String(input).includes('/users/') ? profile : feed())
  }
  const host = mockHost({ settings: { username: 'alexesprit' } })
  const worker = await mountWorker(main, { host })
  try {
    await worker.request('usage.get')
    assert.equal(fetches, 2)
    now = start + CACHE_TTL
    tick()
    await worker.request('usage.get')
    assert.equal(fetches, 4)
    now = start + 2 * CACHE_TTL
    tick()
    await worker.request('usage.get')
    assert.equal(fetches, 6)
  } finally {
    await worker.deactivate()
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
    Date.now = originalNow
  }
})

test('a pending old-username request returns the current user after settings change', async () => {
  let finishOld: (response: Response) => void = () => {}
  let oldStarted: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    oldStarted = resolve
  })
  let api!: import('orca/worker').OrcaWorkerApi
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/users/')) {
      const name = url.endsWith('/old') ? 'old' : 'new'
      return json({ id: name, username: name })
    }
    if (url.endsWith('user_id=old'))
      return new Promise<Response>((resolve) => {
        finishOld = resolve
        oldStarted()
      })
    return json(feed())
  }
  const host = mockHost({ settings: { username: 'old' } })
  const worker = await mountWorker(
    {
      default: async (value) => {
        api = value
        await main.default(value)
      },
      deactivate: main.deactivate,
    },
    { host },
  )
  try {
    const pending = worker.request('usage.get')
    await started
    await api.settings.set('username', 'new')
    const current = await worker.request('usage.get')
    assert.equal(current.username, 'new')
    finishOld(json(feed()))
    const result = await pending
    assert.equal(result.username, 'new')
    assert.equal(result.snapshot?.profile.username, 'new')
    assert.equal(
      (host.data().storage.snapshotV1 as { username: string }).username,
      'new',
    )
    assert.ok(
      worker.posts.every(
        (post) => (post.payload as { username: string }).username === 'new',
      ),
    )
  } finally {
    await worker.deactivate()
  }
})
