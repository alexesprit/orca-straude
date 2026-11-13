import type { State } from './data'

declare module 'orca' {
  interface PluginRequests {
    'usage.get': { input: { force?: boolean } | undefined; output: State }
    'usage.configure': { input: { username: string }; output: State }
  }
  interface PluginPanelEvents {
    'usage.changed': State
  }
}
