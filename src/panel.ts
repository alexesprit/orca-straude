import type {} from 'orca/frame'
import type { State } from './data'
import { modelBreakdown, modelColors } from './models'
import { type HistoryView, renderPanel } from './panel-view'
import type {} from './protocol'

const panelRoot = document.getElementById('app')
if (!panelRoot) throw new Error('Missing panel root.')
const root = panelRoot
let state: State | null = null
let colors: Record<string, string> = {}
let busy = false
let error = ''
let requestId = 0

function emptyHistory(): HistoryView {
  return {
    open: false,
    posts: [],
    selected: null,
    cursor: null,
    loading: false,
    error: '',
  }
}
let history = emptyHistory()
let historyLoaded = false

function receive(next: State, refreshHistory = false) {
  const previous = state?.snapshot
  state = next
  if (
    next.username !== previous?.username ||
    next.snapshot?.profile.id !== previous?.profile.id
  ) {
    history = emptyHistory()
    historyLoaded = false
  } else if (
    refreshHistory ||
    (!history.open &&
      !history.selected &&
      previous?.fetchedAt !== next.snapshot?.fetchedAt)
  ) {
    history = {
      ...emptyHistory(),
      open: history.open,
      selected: history.selected,
    }
    historyLoaded = false
    if (history.open) void loadHistory()
  }
}

async function loadHistory() {
  const profileId = state?.snapshot?.profile.id
  if (!profileId || history.loading) return
  const active = history
  active.loading = true
  active.error = ''
  render()
  try {
    const page = await orca.plugin.request('usage.history', {
      profileId,
      cursor: active.cursor,
    })
    if (active !== history) return
    const posts = new Map(active.posts.map((post) => [post.id, post]))
    for (const post of page.posts) posts.set(post.id, post)
    active.posts = [...posts.values()]
    if (active.selected)
      active.selected = posts.get(active.selected.id) ?? active.selected
    active.cursor = page.cursor === active.cursor ? null : page.cursor
    historyLoaded = true
  } catch (reason) {
    active.error =
      reason instanceof Error ? reason.message : 'Could not load recent posts.'
  } finally {
    active.loading = false
    if (active === history) render()
  }
}

function render() {
  const names = state?.snapshot
    ? modelBreakdown(history.selected ?? state.snapshot.usage).map(
        (model) => model.name,
      )
    : []
  const next = modelColors(names, colors)
  if (JSON.stringify(next) !== JSON.stringify(colors)) {
    colors = next
    void orca.storage
      .set('modelColorsV1', colors)
      .catch((reason) => console.warn('Could not save model colors:', reason))
  }
  const focused = document.activeElement?.id
  root.setAttribute('aria-busy', String(busy))
  root.innerHTML = renderPanel(state, busy, error, colors, orca.locale, history)
  if (focused)
    (
      document.getElementById(focused) ??
      document.getElementById('history-toggle')
    )?.focus({ preventScroll: true })
}

async function load(force = false) {
  const id = ++requestId
  busy = true
  error = ''
  render()
  try {
    const result = await orca.plugin.request('usage.get', { force })
    if (id === requestId) receive(result, force && !result.error)
  } catch (reason) {
    if (id === requestId)
      error =
        reason instanceof Error ? reason.message : 'Could not load Straude.'
  } finally {
    if (id === requestId) {
      busy = false
      render()
    }
  }
}

root.addEventListener('click', (event) => {
  const button = (event.target as Element).closest('button')
  if (button?.id === 'history-toggle') {
    history.open = !history.open
    if (history.open && !historyLoaded && !history.loading) void loadHistory()
    else render()
  } else if (button?.id === 'history-more') {
    void loadHistory()
  } else if (button?.id === 'history-today') {
    history.selected = null
    render()
  } else if (button?.dataset.post !== undefined) {
    const post = history.posts[Number(button.dataset.post)]
    history.selected =
      post?.date === state?.snapshot?.usage.date ? null : (post ?? null)
    render()
  }
  if ((event.target as Element).closest('#refresh') && !busy) void load(true)
  const link = (event.target as Element).closest<HTMLAnchorElement>(
    'a#open-straude, a#straude-signup',
  )
  if (link) {
    event.preventDefault()
    void orca.host
      .call('shell.openExternal', { url: link.href })
      .catch((reason) => {
        error =
          reason instanceof Error ? reason.message : 'Could not open Straude.'
        render()
      })
  }
})

async function start() {
  try {
    colors = modelColors([], await orca.storage.get('modelColorsV1'))
  } catch (reason) {
    console.warn('Could not load model colors:', reason)
  }
  orca.plugin.on('usage.changed', (value) => {
    receive(value)
    render()
  })
  await load()
}
void start()
