import { assert, test } from 'orca/testing'
import {
  currentSnapshot,
  emptyUsage,
  profileFrom,
  today,
  tokens,
  usageFrom,
  username,
} from './data'
import { example } from './fixture'
import { modelBreakdown } from './models'
import { renderPanel } from './panel-view'

test('formats tokens with one decimal and compact uppercase units', () => {
  for (const [value, expected] of [
    [0, '0.0'],
    [999, '999.0'],
    [1000, '1.0K'],
    [1234, '1.2K'],
    [999999, '1.0M'],
    [1000000, '1.0M'],
    [18446720, '18.4M'],
    [1000000000, '1.0B'],
    [1234567890, '1.2B'],
  ] as const)
    assert.equal(tokens(value), expected)
})

test('normalizes profile and username and rejects invalid API payloads', () => {
  assert.equal(username(' @@alexesprit '), 'alexesprit')
  assert.equal(profileFrom({ id: 'id', streak: 67 }, 'alexesprit').streak, 67)
  assert.throws(() => profileFrom({ error: 'not found' }, 'user'))
  assert.throws(() => usageFrom({ error: 'unavailable' }))
  assert.throws(() => usageFrom({ posts: [{}] }))
})

test('keeps today’s usage and zeros old or absent usage across midnight', () => {
  assert.equal(today(new Date(2026, 0, 2)), '2026-01-02')
  const feed = {
    posts: [
      {
        daily_usage: {
          date: '2026-01-02',
          cost_usd: 12.34,
          output_tokens: 20,
          input_tokens: -1,
          models: ['gpt', null],
          cache_read_tokens: 80,
          model_breakdown: [{ model: 'gpt', cost_usd: 12.34 }],
        },
      },
    ],
  }
  const usage = usageFrom(feed, '2026-01-02')
  assert.equal(usage.cost, 12.34)
  assert.equal(usage.input, 0)
  assert.deepEqual(usage.models, ['gpt'])
  assert.deepEqual(usageFrom(feed, '2026-01-03'), emptyUsage('2026-01-03'))
  assert.deepEqual(
    usageFrom({ posts: [] }, '2026-01-03'),
    emptyUsage('2026-01-03'),
  )
  assert.deepEqual(
    currentSnapshot(example.snapshot, '2027-01-01').usage,
    emptyUsage('2027-01-01'),
  )
})

test('missing and invalid model costs stay unavailable while a real zero stays zero', () => {
  const usage = usageFrom({
    posts: [
      {
        daily_usage: {
          date: today(),
          models: [],
          model_breakdown: [
            { model: 'missing' },
            { model: 'null', cost_usd: null },
            { model: 'invalid', cost_usd: 'bad' },
            { model: 'zero', cost_usd: 0 },
            { model: 'partial', cost_usd: 2 },
            { model: 'partial' },
          ],
        },
      },
    ],
  })
  const models = modelBreakdown(usage)
  assert.equal(models.find((model) => model.name === 'zero')?.cost, 0)
  for (const name of ['missing', 'null', 'invalid', 'partial']) {
    assert.equal(models.find((model) => model.name === name)?.cost, null)
  }
  const html = renderPanel(
    { ...example, snapshot: { ...example.snapshot, usage } },
    false,
    '',
    {},
  )
  assert.ok(html.includes('Cost breakdown unavailable'))
  assert.ok(html.includes('<span class="model-cost">—</span>'))
  assert.ok(html.includes('<span class="model-cost">$0.00</span>'))
})
