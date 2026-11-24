import { assert, test } from 'orca/testing'
import { emptyUsage, type State } from './data'
import { example } from './fixture'
import { modelColors } from './models'
import { renderPanel } from './panel-view'

const state = {
  ...example,
  snapshot: {
    ...example.snapshot,
    usage: {
      ...emptyUsage(),
      cost: 19.3149,
      input: 364783,
      output: 32693,
      total: 18844196,
      sessions: 1,
      models: ['gpt-5.6-luna', 'gpt-6-astra', 'gpt-6.1-sol'],
      breakdown: [
        { model: 'gpt-5.6-luna', cost: 0.02626888 },
        { model: 'gpt-6-astra', cost: 18.678934 },
        { model: 'gpt-6.1-sol', cost: 0.6096592 },
      ],
      verified: true,
    },
  },
} satisfies State

test('renders layout A with sorted models, palette A, spend shares and existing profile stats', () => {
  const html = renderPanel(
    state,
    false,
    '',
    modelColors(state.snapshot.usage.models, null),
  )
  assert.ok(html.includes('96.7%'))
  assert.ok(html.includes('$18.68'))
  assert.ok(html.includes('364.8K'))
  assert.ok(html.includes('ES / Europe'))
  assert.ok(html.includes('id="open-straude" href="https://straude.com"'))
  assert.ok(html.includes('role="img"'))
  assert.ok(
    html.indexOf('gpt-6-astra</span>') < html.indexOf('gpt-6.1-sol</span>'),
  )
  assert.ok(!html.includes('Total spend'))
  assert.ok(!html.includes('gpt-5.6-luna, gpt-6-astra'))
  assert.ok(!html.includes('NaN'))
})

test('escapes remote profile names, model names and errors before inserting HTML', () => {
  const unsafe = '<img src=x onerror=alert(1)>'
  const changed: State = {
    ...state,
    error: unsafe,
    snapshot: {
      ...state.snapshot,
      profile: { ...state.snapshot.profile, name: unsafe },
      usage: { ...emptyUsage(), models: [unsafe] },
    },
  }
  const html = renderPanel(changed, false, '', {})
  assert.ok(!html.includes(unsafe))
  assert.ok(html.includes('&lt;img'))
  assert.ok(html.includes('Cost breakdown unavailable'))
})

test('handles zero spend, missing breakdowns, offline and loading states', () => {
  const zero = {
    ...state,
    snapshot: { ...state.snapshot, usage: emptyUsage() },
  }
  assert.ok(renderPanel(zero, false, '', {}).includes('No model usage today.'))
  const loading = renderPanel(state, true, '', {})
  assert.ok(loading.includes('disabled>Refreshing…</button>'))
  assert.ok(!loading.includes('Refreshing Straude'))
  assert.ok(
    renderPanel(
      { ...state, stale: true, error: 'Offline' },
      false,
      '',
      {},
    ).includes('Showing cached data'),
  )
  assert.ok(renderPanel(null, false, '', {}).includes('Settings → Plugins'))
  assert.ok(renderPanel(null, false, '', {}).includes('Open Straude'))
})

test('formats the usage calendar day in the UI locale without timezone shifts', () => {
  const dated = {
    ...state,
    snapshot: {
      ...state.snapshot,
      usage: { ...state.snapshot.usage, date: '2026-11-14' },
    },
  }
  assert.ok(
    renderPanel(dated, false, '', {}, 'en-US').includes(
      '<p class="muted date">Nov 14, 2026</p>',
    ),
  )
  assert.ok(
    renderPanel(dated, false, '', {}, 'en-GB').includes(
      '<p class="muted date">14 Nov 2026</p>',
    ),
  )
  assert.ok(
    renderPanel(dated, false, '', {}, 'de-DE').includes(
      '<p class="muted date">14.11.2026</p>',
    ),
  )
})

test('shows selected post stats and history controls with current profile and rankings', () => {
  const selected = {
    ...emptyUsage('2020-01-01'),
    id: 'older',
    cost: 42,
    sessions: 8,
  }
  const history = {
    open: true,
    selected,
    posts: [selected],
    cursor: 'next',
    loading: false,
    error: '',
  }
  const view = () => renderPanel(state, false, '', {}, 'en-US', history)
  const html = view()
  for (const label of [
    'Daily spend',
    '$42.00',
    'Jan 1, 2020',
    '<dd>8</dd>',
    'Load more',
    'Back to today',
    'ES / Europe',
    'Rankings',
    'aria-pressed="true"',
  ])
    assert.ok(html.includes(label))
  assert.ok(!html.includes('Today’s spend'))
  history.open = false
  assert.ok(view().includes('Recent posts · Jan 1, 2020'))
  history.open = true
  assert.ok(
    !renderPanel(state, false, '', {}, 'en-US', {
      ...history,
      cursor: null,
    }).includes('Load more'),
  )
})
