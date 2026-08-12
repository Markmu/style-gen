import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const defaultRoot = resolve(dirname(scriptPath), '..')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function normalizeScalar(value) {
  const trimmed = value.trim()
  if (trimmed === '') return '<nested>'
  return trimmed.replace(/^['"]|['"]$/g, '')
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  const values = {}
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
    if (entry) values[entry[1]] = normalizeScalar(entry[2])
  }
  return values
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasSecondLevelHeading(markdown, title) {
  const pattern = new RegExp(`^##\\s+(?:\\d+(?:\\.\\d+)*\\.\\s+)?${escapeRegExp(title)}\\s*$`, 'm')
  return pattern.test(markdown)
}

function sectionBody(markdown, title) {
  const lines = markdown.split(/\r?\n/)
  const titlePattern = new RegExp(`^##\\s+(?:\\d+(?:\\.\\d+)*\\.\\s+)?${escapeRegExp(title)}\\s*$`)
  const start = lines.findIndex((line) => titlePattern.test(line))
  if (start < 0) return ''
  const endOffset = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line))
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset
  return lines.slice(start + 1, end).join('\n')
}

function markdownTableCells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function collectFiles(directory, predicate, skippedDirectories = new Set()) {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        files.push(...collectFiles(path, predicate, skippedDirectories))
      }
    } else if (entry.isFile() && predicate(path)) {
      files.push(path)
    }
  }
  return files
}

function pathLabel(root, path) {
  return relative(root, path).split(sep).join('/')
}

function validateAgentOwners(root, errors) {
  const skillFiles = [
    ...collectFiles(join(root, '.agents', 'skills'), (path) => path.endsWith('.md')),
    ...collectFiles(join(root, '.claude', 'skills'), (path) => path.endsWith('.md')),
  ]

  for (const path of skillFiles) {
    const content = readFileSync(path, 'utf8')
    if (content.includes('.claude/contracts/workflow-schema.json')) {
      errors.push(`${pathLabel(root, path)} references the compatibility contract instead of .agents SSOT`)
    }
    if (content.includes('.claude/rules/')) {
      errors.push(`${pathLabel(root, path)} references compatibility rules instead of .agents/rules`)
    }
  }

  return skillFiles.length
}

function validateNewFeatureSpec(root, path, markdown, contract, errors) {
  const metadata = parseFrontmatter(markdown)
  if (metadata.workflow_type !== contract.new_feature.workflow_type) return false

  for (const field of contract.new_feature.required_frontmatter_fields) {
    if (!(field in metadata)) errors.push(`${pathLabel(root, path)} is missing frontmatter field ${field}`)
  }
  if (!contract.new_feature.frontmatter_status.includes(metadata.status)) {
    errors.push(`${pathLabel(root, path)} has invalid status ${metadata.status ?? '<missing>'}`)
  }
  for (const section of contract.new_feature.required_sections) {
    if (!hasSecondLevelHeading(markdown, section)) {
      errors.push(`${pathLabel(root, path)} is missing section "${section}"`)
    }
  }
  return true
}

function validatePlan(root, path, markdown, contract, errors) {
  const metadata = parseFrontmatter(markdown)
  if (metadata.workflow_type !== 'create-dev-plan') return false

  const label = pathLabel(root, path)
  const planDirectory = dirname(path)
  const accepted = metadata.status === 'accepted' || metadata.status === 'released'

  if (!contract.plan.readme_frontmatter_status.includes(metadata.status)) {
    errors.push(`${label} has invalid plan status ${metadata.status ?? '<missing>'}`)
  }

  for (const section of contract.plan.feature_readme_required_sections) {
    if (!hasSecondLevelHeading(markdown, section)) errors.push(`${label} is missing section "${section}"`)
  }

  const expectedStateHeading = `## ${contract.auto_dev.readme_section}`
  if (!markdown.split(/\r?\n/).includes(expectedStateHeading)) {
    errors.push(`${label} must own its state machine at "${expectedStateHeading}"`)
  }

  if (!metadata.source_architecture) {
    errors.push(`${label} is missing source_architecture`)
  } else if (!existsSync(join(root, metadata.source_architecture))) {
    errors.push(`${label} references missing architecture ${metadata.source_architecture}`)
  }

  const acceptanceRows = sectionBody(markdown, '验收标准追踪矩阵')
    .split(/\r?\n/)
    .filter((line) => /^\|\s*AC-\d+[^|]*\|/.test(line))

  for (const row of acceptanceRows) {
    const cells = markdownTableCells(row)
    const status = cells.at(-1)
    if (!contract.plan.acceptance_status.includes(status)) {
      errors.push(`${label} has invalid acceptance status ${status} for ${cells[0]}`)
    } else if (accepted && (status === 'planned' || status === 'in-progress')) {
      errors.push(`${label} is ${metadata.status} while ${cells[0]} remains ${status}`)
    }
  }

  const taskFiles = readdirSync(planDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => join(planDirectory, entry.name))

  for (const taskPath of taskFiles) {
    const taskMetadata = parseFrontmatter(readFileSync(taskPath, 'utf8'))
    if (!taskMetadata.status) continue
    if (!contract.plan.task_file_status.includes(taskMetadata.status)) {
      errors.push(`${pathLabel(root, taskPath)} has invalid task status ${taskMetadata.status}`)
    } else if (accepted && taskMetadata.status !== 'done' && taskMetadata.status !== 'deprecated') {
      errors.push(`${label} is ${metadata.status} while ${pathLabel(root, taskPath)} is ${taskMetadata.status}`)
    }
  }

  const stateRows = sectionBody(markdown, '开发状态机')
    .split(/\r?\n/)
    .filter((line) => /^\|\s*(?:PLAN|plan|FEAT)-[^|]+\|/.test(line))

  for (const row of stateRows) {
    const cells = markdownTableCells(row)
    if (accepted && cells[1] !== 'done') {
      errors.push(`${label} is ${metadata.status} while state row ${cells[0]} remains ${cells[1]}`)
    }

    const evidenceReferences = [...(cells[6] ?? '').matchAll(/`([^`]+\.md)`/g)].map((match) => match[1])
    if (accepted && evidenceReferences.length === 0) {
      errors.push(`${label} has no review evidence reference for completed state row ${cells[0]}`)
    }
    for (const evidenceReference of evidenceReferences) {
      const evidencePath = evidenceReference.startsWith('docs/')
        ? join(root, evidenceReference)
        : join(planDirectory, evidenceReference)
      if (!existsSync(evidencePath)) {
        errors.push(`${label} references missing evidence ${evidenceReference}`)
      }
    }
  }

  return true
}

export function checkWorkflowConsistency(root = defaultRoot) {
  const resolvedRoot = resolve(root)
  const errors = []
  const contractPath = join(resolvedRoot, '.agents', 'contracts', 'workflow-schema.json')
  const mirrorPath = join(resolvedRoot, '.claude', 'contracts', 'workflow-schema.json')

  if (!existsSync(contractPath)) return { errors: ['Missing .agents/contracts/workflow-schema.json'], plans: 0, specs: 0, skills: 0 }
  if (!existsSync(mirrorPath)) return { errors: ['Missing .claude contract compatibility mirror'], plans: 0, specs: 0, skills: 0 }

  const contract = readJson(contractPath)
  const mirror = readJson(mirrorPath)
  if (JSON.stringify(contract) !== JSON.stringify(mirror)) {
    errors.push('.claude contract mirror differs from .agents contract SSOT')
  }

  const skills = validateAgentOwners(resolvedRoot, errors)
  const documentFiles = collectFiles(
    join(resolvedRoot, 'docs'),
    (path) => path.endsWith('.md'),
    new Set(['backup', 'reviews', 'evidence', 'product-design', 'stitch-reference']),
  )

  let plans = 0
  let specs = 0
  for (const path of documentFiles) {
    const markdown = readFileSync(path, 'utf8')
    if (path.endsWith(`${sep}README.md`) && validatePlan(resolvedRoot, path, markdown, contract, errors)) plans += 1
    if (validateNewFeatureSpec(resolvedRoot, path, markdown, contract, errors)) specs += 1
  }

  return { errors, plans, specs, skills }
}

function cliRoot(argumentsList) {
  const rootIndex = argumentsList.indexOf('--root')
  return rootIndex >= 0 ? argumentsList[rootIndex + 1] : defaultRoot
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const result = checkWorkflowConsistency(cliRoot(process.argv.slice(2)))
  if (result.errors.length > 0) {
    console.error(`workflow:check failed with ${result.errors.length} error(s)`)
    for (const error of result.errors) console.error(`- ${error}`)
    process.exitCode = 1
  } else {
    console.log(`workflow:check pass (${result.plans} plans, ${result.specs} standalone specs, ${result.skills} Skill documents)`)
  }
}
