import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const expectedNode = readFileSync(join(projectRoot, '.node-version'), 'utf8').trim()
const expectedPnpm = packageJson.packageManager?.split('@').at(-1)
const failures = []
const warnings = []

function record(condition, message, bucket = failures) {
  if (!condition) bucket.push(message)
}

record(process.versions.node === expectedNode, `Node ${expectedNode} is required; found ${process.versions.node}`)

const userAgent = process.env.npm_config_user_agent ?? ''
let actualPnpm = userAgent.match(/pnpm\/([^\s]+)/)?.[1]
if (!actualPnpm) {
  const result = spawnSync('pnpm', ['--version'], { cwd: projectRoot, encoding: 'utf8' })
  actualPnpm = result.status === 0 ? result.stdout.trim() : undefined
}
record(actualPnpm === expectedPnpm, `pnpm ${expectedPnpm} is required; found ${actualPnpm ?? 'unavailable'}`)

record(existsSync(join(projectRoot, 'pnpm-lock.yaml')), 'pnpm-lock.yaml is missing')
record(existsSync(join(projectRoot, '.env.example')), '.env.example is missing')

if (!existsSync(join(projectRoot, '.env.local')) && !existsSync(join(projectRoot, '.env'))) {
  warnings.push('No .env.local or .env file found; mocked checks can run, but live app flows need local configuration')
}

const composeResult = spawnSync('docker', ['compose', 'config', '--quiet'], {
  cwd: projectRoot,
  encoding: 'utf8',
})
if (composeResult.error?.code === 'ENOENT') {
  warnings.push('Docker is unavailable; database commands cannot run')
} else if (composeResult.status !== 0) {
  failures.push(`docker compose config failed: ${(composeResult.stderr || composeResult.stdout).trim()}`)
}

if (failures.length === 0) {
  console.log(`doctor: pass (Node ${expectedNode}, pnpm ${expectedPnpm})`)
} else {
  console.error('doctor: failed')
  for (const failure of failures) console.error(`- ${failure}`)
}

for (const warning of warnings) console.warn(`doctor: warning - ${warning}`)
console.log('doctor: external credentials, provider reachability, database health, and Playwright browsers are not probed')

process.exitCode = failures.length === 0 ? 0 : 1
