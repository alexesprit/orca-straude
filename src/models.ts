import type { Usage } from './data'

export const PALETTE = [
  '#60A5FA',
  '#FBBF24',
  '#C084FC',
  '#34D399',
  '#FB7185',
  '#22D3EE',
] as const
export type Model = { name: string; cost: number | null; share: number | null }

export function modelBreakdown(usage: Usage): Model[] {
  const costs = new Map<string, number | null>()
  for (const item of usage.breakdown) {
    if (item.model)
      costs.set(
        item.model,
        item.cost === null || costs.get(item.model) === null
          ? null
          : (costs.get(item.model) ?? 0) + item.cost,
      )
  }
  for (const name of usage.models)
    if (name && !costs.has(name)) costs.set(name, null)
  const total = [...costs.values()].reduce<number>(
    (sum, cost) => sum + (cost ?? 0),
    0,
  )
  return [...costs]
    .map(([name, cost]) => ({
      name,
      cost,
      share: cost !== null && total > 0 ? (cost / total) * 100 : null,
    }))
    .sort(
      (a, b) => (b.cost ?? -1) - (a.cost ?? -1) || a.name.localeCompare(b.name),
    )
}

export function modelColors(
  names: string[],
  previous: unknown,
): Record<string, string> {
  const saved = new Map<string, string>()
  if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
    for (const [name, color] of Object.entries(previous)) {
      if (PALETTE.includes(color as (typeof PALETTE)[number]))
        saved.set(name, color)
    }
  }
  const used = new Set<string>()
  const sorted = [...new Set(names)]
    .sort()
    .sort((a, b) => Number(saved.has(b)) - Number(saved.has(a)))
  for (const name of sorted) {
    let hash = 0
    for (const character of name)
      hash = (Math.imul(hash, 31) + (character.codePointAt(0) ?? 0)) >>> 0
    let index = saved.has(name)
      ? PALETTE.indexOf(saved.get(name) as (typeof PALETTE)[number])
      : hash % PALETTE.length
    for (
      let tries = 0;
      used.has(PALETTE[index]) && tries < PALETTE.length;
      tries++
    )
      index = (index + 1) % PALETTE.length
    // shortcut: more than six simultaneous models reuse colors; add palette colors if this becomes common.
    saved.set(name, PALETTE[index])
    used.add(PALETTE[index])
  }
  return Object.fromEntries(saved)
}
