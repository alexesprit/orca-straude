import { assert, test } from 'orca/testing'
import { emptyUsage } from './data'
import { modelBreakdown, modelColors, PALETTE } from './models'

test('sorts model spend, combines duplicates, includes missing breakdowns and uses unrounded shares', () => {
  const models = modelBreakdown({
    ...emptyUsage(),
    models: ['new-model', 'astra', 'sol'],
    breakdown: [
      { model: 'sol', cost: 0.6 },
      { model: 'astra', cost: 18 },
      { model: 'astra', cost: 0.6 },
    ],
  })
  assert.deepEqual(
    models.map((model) => model.name),
    ['astra', 'sol', 'new-model'],
  )
  assert.equal(models[0].cost, 18.6)
  assert.ok(models[0].share !== null)
  assert.ok(Math.abs(models[0].share - 96.875) < 0.0001)
  assert.equal(models[2].cost, null)
  assert.equal(models[2].share, null)
  assert.equal(
    modelBreakdown({
      ...emptyUsage(),
      breakdown: [{ model: 'zero', cost: 0 }],
    })[0].share,
    null,
  )
})

test('assigns palette colors to arbitrary names without collisions up to six and preserves assignments', () => {
  const names = [
    'model-a',
    'model-g',
    'model-m',
    'model-s',
    'model-y',
    '__proto__',
  ]
  const colors = modelColors(names, null)
  assert.equal(new Set(Object.values(colors)).size, 6)
  assert.ok(
    Object.values(colors).every((color) =>
      PALETTE.includes(color as (typeof PALETTE)[number]),
    ),
  )
  assert.deepEqual(modelColors([...names].reverse(), null), colors)
  assert.deepEqual(modelColors([...names].reverse(), colors), colors)
  const extended = modelColors([...names.slice(0, 3), 'new-model'], colors)
  for (const name of names.slice(0, 3))
    assert.equal(extended[name], colors[name])
  assert.equal(
    new Set([...names.slice(0, 3), 'new-model'].map((name) => extended[name]))
      .size,
    4,
  )
  assert.equal(Object.hasOwn(colors, '__proto__'), true)
  assert.notEqual(
    modelColors(['evil'], { evil: 'url(https://example.com)' }).evil,
    'url(https://example.com)',
  )
  assert.equal(
    Object.keys(modelColors([...names, 'seventh'], colors)).length,
    7,
  )
})
