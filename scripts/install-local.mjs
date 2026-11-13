import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const staging = join(root, '.orca', 'install')
rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })
for (const name of [
  'orca-plugin.json',
  'src',
  'media',
  'LICENSE.md',
  'README.md',
]) {
  cpSync(join(root, name), join(staging, name), { recursive: true })
}

const cli =
  process.env.ORCA_CLI_COMMAND ||
  (process.platform === 'linux' ? 'orca-ide' : 'orca')
const result = spawnSync(
  cli,
  ['plugin', 'install', staging, '--json', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
  },
)
if (result.error) throw result.error
process.exitCode = result.status ?? 1
