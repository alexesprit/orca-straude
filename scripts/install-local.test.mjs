import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('stages only plugin files, removes stale files and forwards approval arguments and exit status', (t) => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'straude-install-test-')),
  )
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'scripts'))
  cpSync(
    new URL('./install-local.mjs', import.meta.url),
    join(root, 'scripts/install-local.mjs'),
  )
  for (const name of [
    'src',
    'media',
    'node_modules/.bin',
    '.git',
    '.orca/install',
  ])
    mkdirSync(join(root, name), { recursive: true })
  for (const name of [
    'orca-plugin.json',
    'LICENSE.md',
    'README.md',
    'src/worker.ts',
    'media/cover.png',
    '.orca/install/stale.txt',
  ])
    writeFileSync(join(root, name), name)
  symlinkSync('nonexistent-biome', join(root, 'node_modules/.bin/biome'))
  const cli = join(root, 'fake-orca')
  writeFileSync(
    cli,
    `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
writeFileSync(${JSON.stringify(join(root, 'arguments.json'))}, JSON.stringify(process.argv.slice(2)));
process.exit(3);
`,
    { mode: 0o755 },
  )
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts/install-local.mjs'), '--approve', 'ap1-test'],
    {
      env: { ...process.env, ORCA_CLI_COMMAND: cli },
      encoding: 'utf8',
    },
  )
  assert.equal(result.status, 3, result.stderr)
  const staging = join(root, '.orca/install')
  assert.deepEqual(
    JSON.parse(readFileSync(join(root, 'arguments.json'), 'utf8')),
    ['plugin', 'install', staging, '--json', '--approve', 'ap1-test'],
  )
  assert.equal(existsSync(join(staging, 'node_modules')), false)
  assert.equal(existsSync(join(staging, '.git')), false)
  assert.equal(existsSync(join(staging, 'stale.txt')), false)
  assert.equal(
    readFileSync(join(staging, 'src/worker.ts'), 'utf8'),
    'src/worker.ts',
  )
  assert.equal(existsSync(join(root, 'node_modules/.bin')), true)
})
