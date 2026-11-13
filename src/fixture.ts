import { emptyUsage, type State } from './data'

export const example = {
  username: 'alexesprit',
  error: '',
  stale: false,
  snapshot: {
    username: 'alexesprit',
    fetchedAt: Date.now(),
    profile: {
      id: 'example-id',
      username: 'alexesprit',
      name: '',
      country: 'ES',
      region: 'europe',
      followers: 12,
      following: 1,
      posts: 98,
      totalCost: 1000,
      streak: 67,
      level: 7,
      globalRank: 13,
      regionalRank: 1,
    },
    usage: {
      ...emptyUsage(),
      cost: 129.39,
      input: 7752112,
      output: 681855,
      cacheRead: 140357248,
      total: 148791215,
      sessions: 1,
      models: ['gpt-5.5'],
      breakdown: [{ model: 'gpt-5.5', cost: 129.39 }],
      verified: true,
    },
  },
} satisfies State
