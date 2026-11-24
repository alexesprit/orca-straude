import { readFileSync, writeFileSync } from 'node:fs'

const manifestPath = 'orca-plugin.json'
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

manifest.version = version
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
