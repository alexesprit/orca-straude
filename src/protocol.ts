import type { HistoryPage, State } from './data'

declare module 'orca' {
  interface PluginRequests {
    'usage.get': { input: { force?: boolean } | undefined; output: State }
    'usage.history': {
      input: { profileId: string; cursor: string | null }
      output: HistoryPage
    }
    'usage.configure': { input: { username: string }; output: State }
  }
  interface PluginPanelEvents {
    'usage.changed': State
  }
}
