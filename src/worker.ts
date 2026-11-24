import type { OrcaWorkerApi } from 'orca/worker'
import {
  CACHE_TTL,
  currentSnapshot,
  historyFrom,
  money,
  profileFrom,
  type Snapshot,
  type State,
  today,
  usageFrom,
  username,
} from './data'
import type {} from './protocol'

let timer: ReturnType<typeof setInterval> | undefined
let settingsSubscription: { dispose(): void } | undefined
let stopped = false

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok)
    throw new Error(`Straude request failed (${response.status}).`)
  return response.json()
}

export default async function activate(orca: OrcaWorkerApi) {
  stopped = false
  const pending = new Map<string, Promise<State>>()
  let lastGood: Snapshot | null = null
  let intervalMs = CACHE_TTL

  async function publish(state: State): Promise<State> {
    if (
      stopped ||
      username(await orca.settings.get('username')) !== state.username
    )
      return state
    const usage = state.snapshot?.usage
    await orca.host.call('statusBar.update', {
      id: 'spend',
      text: !state.username
        ? 'Straude: set username'
        : usage
          ? `Straude ${money(usage.cost)}`
          : 'Straude: unavailable',
      tone: state.stale || state.error ? 'warning' : 'neutral',
      tooltip: !state.username
        ? 'Set your Straude username in plugin settings.'
        : `${state.username} · ${usage?.date || today()}${state.stale ? ' · cached' : ''}${state.error ? ` · ${state.error}` : ''}`,
    })
    orca.panels.post('usage.changed', state)
    return state
  }

  async function load(name: string, force: boolean): Promise<State> {
    if (!name)
      return publish({ username: '', snapshot: null, stale: false, error: '' })
    const stored = (await orca.storage.get(
      'snapshotV1',
    )) as unknown as Snapshot | null
    const cached =
      lastGood?.username === name
        ? lastGood
        : stored?.username === name
          ? stored
          : null
    if (
      !force &&
      cached &&
      cached.usage.date === today() &&
      Date.now() - cached.fetchedAt < intervalMs
    ) {
      return publish({
        username: name,
        snapshot: cached,
        stale: false,
        error: '',
      })
    }
    try {
      let profile = cached?.profile
      let profileError = ''
      try {
        profile = profileFrom(
          await getJson(
            `https://straude.com/api/users/${encodeURIComponent(name)}`,
          ),
          name,
        )
      } catch (error) {
        if (!profile) throw error
        profileError = 'Profile refresh failed; showing cached profile.'
      }
      const feed = await getJson(
        `https://straude.com/api/feed?type=user&limit=1&user_id=${encodeURIComponent(profile.id)}`,
      )
      const snapshot: Snapshot = {
        username: name,
        profile,
        usage: usageFrom(feed),
        fetchedAt: Date.now(),
      }
      // A previous username's request must never overwrite the new user's cache or display.
      if (!stopped && username(await orca.settings.get('username')) === name) {
        if (!profileError) {
          lastGood = snapshot
          await orca.storage.set('snapshotV1', snapshot)
        }
      }
      return publish({
        username: name,
        snapshot,
        stale: !!profileError,
        error: profileError,
      })
    } catch (error) {
      return publish({
        username: name,
        snapshot: cached ? currentSnapshot(cached) : null,
        stale: !!cached,
        error:
          error instanceof Error ? error.message : 'Could not refresh Straude.',
      })
    }
  }

  async function refresh(force = false): Promise<State> {
    const name = username(await orca.settings.get('username'))
    const active = pending.get(name)
    const request =
      active ?? load(name, force).finally(() => pending.delete(name))
    if (!active) pending.set(name, request)
    const result = await request
    // A caller waiting across a username change must receive the current user's data.
    if (username(await orca.settings.get('username')) !== name) return refresh()
    return result
  }

  const background = (force = false) => {
    void refresh(force).catch((error) =>
      orca.log(`Straude update failed: ${error}`),
    )
  }
  async function schedule() {
    const minutes = await orca.settings.get('refreshIntervalMinutes')
    if (stopped) return
    intervalMs =
      typeof minutes === 'number' && [5, 15, 30, 60].includes(minutes)
        ? minutes * 60_000
        : CACHE_TTL
    clearInterval(timer)
    timer = setInterval(() => background(true), intervalMs)
  }
  orca.panels.handle('usage.get', (input) => refresh(input?.force === true))
  orca.panels.handle('usage.history', async ({ profileId, cursor }) => {
    const query = new URLSearchParams({
      type: 'user',
      user_id: profileId,
      limit: '5',
    })
    if (cursor) query.set('cursor', cursor)
    return historyFrom(await getJson(`https://straude.com/api/feed?${query}`))
  })
  orca.panels.handle('usage.configure', async (input) => {
    if (typeof input?.username !== 'string' || input.username.length > 80)
      throw new Error('Invalid Straude username.')
    await orca.settings.set('username', username(input.username))
    return refresh()
  })
  settingsSubscription = orca.settings.onDidChange(({ key }) => {
    if (key === 'refreshIntervalMinutes') {
      void schedule()
        .then(() => background())
        .catch((error) => orca.log(`Straude schedule failed: ${error}`))
    } else if (key === 'username') background()
  })
  await schedule()
  background()
}

export function deactivate() {
  stopped = true
  clearInterval(timer)
  settingsSubscription?.dispose()
}
