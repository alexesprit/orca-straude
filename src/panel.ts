import type {} from 'orca/frame'
import type { State } from './data'
import { modelBreakdown, modelColors } from './models'
import { renderPanel } from './panel-view'
import type {} from './protocol'

const panelRoot = document.getElementById('app')
if (!panelRoot) throw new Error('Missing panel root.')
const root = panelRoot
let state: State | null = null
let colors: Record<string, string> = {}
let busy = false
let error = ''
let requestId = 0

function render() {
  const names = state?.snapshot
    ? modelBreakdown(state.snapshot.usage).map((model) => model.name)
    : []
  const next = modelColors(names, colors)
  if (JSON.stringify(next) !== JSON.stringify(colors)) {
    colors = next
    void orca.storage
      .set('modelColorsV1', colors)
      .catch((reason) => console.warn('Could not save model colors:', reason))
  }
  const focused = document.activeElement?.id === 'refresh'
  root.setAttribute('aria-busy', String(busy))
  root.innerHTML = renderPanel(state, busy, error, colors, orca.locale)
  if (focused) document.getElementById('refresh')?.focus()
}

async function load(force = false) {
  const id = ++requestId
  busy = true
  error = ''
  render()
  try {
    const result = await orca.plugin.request('usage.get', { force })
    if (id === requestId) state = result
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
  if ((event.target as Element).closest('#refresh') && !busy) void load(true)
  if ((event.target as Element).closest('#open-straude')) {
    event.preventDefault()
    void orca.host
      .call('shell.openExternal', { url: 'https://straude.com' })
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
    state = value
    render()
  })
  await load()
}
void start()
