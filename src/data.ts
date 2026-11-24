export const CACHE_TTL = 5 * 60 * 1000

export type Profile = {
  id: string
  username: string
  name: string
  country: string
  region: string
  followers: number
  following: number
  posts: number
  totalCost: number
  streak: number
  level: number
  globalRank: number
  regionalRank: number
}

export type Usage = {
  date: string
  cost: number
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
  total: number
  sessions: number
  models: string[]
  breakdown: { model: string; cost: number | null }[]
  verified: boolean
  updatedAt: string
}

export type Snapshot = {
  username: string
  profile: Profile
  usage: Usage
  fetchedAt: number
}

export type State = {
  username: string
  snapshot: Snapshot | null
  error: string
  stale: boolean
}

export function username(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^@+/, '') : ''
}

export function today(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const text = (value: unknown): string =>
  typeof value === 'string' ? value : ''
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

export function profileFrom(payload: unknown, fallback: string): Profile {
  const p = record(payload)
  if (typeof p.id !== 'string' || !p.id)
    throw new Error('Straude profile not found.')
  return {
    id: p.id,
    username: text(p.username) || fallback,
    name: text(p.display_name),
    country: text(p.country),
    region: text(p.region),
    followers: number(p.followers_count),
    following: number(p.following_count),
    posts: number(p.posts_count),
    totalCost: number(p.total_cost),
    streak: number(p.streak),
    level: number(p.level),
    globalRank: number(p.global_rank),
    regionalRank: number(p.regional_rank),
  }
}

export function emptyUsage(date = today()): Usage {
  return {
    date,
    cost: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
    total: 0,
    sessions: 0,
    models: [],
    breakdown: [],
    verified: false,
    updatedAt: '',
  }
}

export function usageFrom(payload: unknown, date = today()): Usage {
  const feed = record(payload)
  if (!Array.isArray(feed.posts))
    throw new Error('Unexpected Straude usage response.')
  if (!feed.posts.length) return emptyUsage(date)
  const usage = postUsage(feed.posts[0])
  return usage.date === date ? usage : emptyUsage(date)
}

function postUsage(post: unknown): Usage {
  const p = record(post)
  const u = record(p.daily_usage)
  if (typeof u.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(u.date)) {
    throw new Error('Missing Straude usage date.')
  }
  return {
    date: u.date,
    cost: number(u.cost_usd),
    input: number(u.input_tokens),
    output: number(u.output_tokens),
    cacheRead: number(u.cache_read_tokens),
    cacheCreation: number(u.cache_creation_tokens),
    total: number(u.total_tokens),
    sessions: number(u.session_count),
    models: Array.isArray(u.models)
      ? u.models.filter((v): v is string => typeof v === 'string')
      : [],
    breakdown: Array.isArray(u.model_breakdown)
      ? u.model_breakdown.map((value) => {
          const item = record(value)
          return {
            model: text(item.model),
            cost:
              typeof item.cost_usd === 'number' &&
              Number.isFinite(item.cost_usd) &&
              item.cost_usd >= 0
                ? item.cost_usd
                : null,
          }
        })
      : [],
    verified: u.is_verified === true,
    updatedAt: text(u.updated_at) || text(p.updated_at),
  }
}

export type HistoryPost = Usage & { id: string }
export type HistoryPage = { posts: HistoryPost[]; cursor: string | null }

export function historyFrom(payload: unknown): HistoryPage {
  const feed = record(payload)
  if (!Array.isArray(feed.posts))
    throw new Error('Unexpected Straude history response.')
  return {
    posts: feed.posts.map((post) => {
      const id = text(record(post).id)
      if (!id) throw new Error('Missing Straude post ID.')
      return { ...postUsage(post), id }
    }),
    cursor: text(feed.next_cursor) || null,
  }
}

export function currentSnapshot(snapshot: Snapshot, date = today()): Snapshot {
  return snapshot.usage.date === date
    ? snapshot
    : { ...snapshot, usage: emptyUsage(date) }
}

export const money = (value: number): string => `$${value.toFixed(2)}`
export const integer = (value: number): string => value.toLocaleString()
const tokenFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
export const tokens = (value: number): string => tokenFormat.format(value)
export const rank = (value: number): string =>
  value > 0 ? `#${integer(value)}` : '—'
