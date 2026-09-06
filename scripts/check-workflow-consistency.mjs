import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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

function evidenceExists(root, ownerPath, reference) {
  const [file, anchor] = reference.split('#')
  const target = file.startsWith('docs/') ? join(root, file) : resolve(dirname(ownerPath), file || '.')
  if (!existsSync(target) || !statSync(target).isFile()) return false
  if (!anchor) return true
  try {
    return hasSecondLevelHeading(readFileSync(target, 'utf8'), decodeURIComponent(anchor))
  } catch {
    return false
  }
}

function validateCompactTask(root, path, markdown, contract, errors) {
  const metadata = parseFrontmatter(markdown)
  if (metadata.status === 'deprecated') return
  const label = pathLabel(root, path)
  const compact = contract.plan.compact
  for (const section of [...contract.plan.feature_task_required_sections, compact.verification_section]) {
    if (!hasSecondLevelHeading(markdown, section)) errors.push(`${label} is missing section "${section}"`)
  }
  if (!['review', 'done'].includes(metadata.status)) return
  for (const field of compact.verification_evidence_fields) {
    if (!metadata[field] || !evidenceExists(root, path, metadata[field])) {
      errors.push(`${label} has missing or invalid ${field}`)
    }
  }
  const acceptance = sectionBody(markdown, '验收标准')
  if (!/^- \[[xX]\]/m.test(acceptance) || /^- \[ \]/m.test(acceptance)) {
    errors.push(`${label} has incomplete acceptance criteria`)
  }
  if (/\(waived:\s*\)/i.test(acceptance)) errors.push(`${label} has an acceptance waiver without a reason`)
  if (metadata.status === 'done') {
    const reference = metadata[compact.review_evidence_field]
    const reviewPath = reference?.split('#')[0]
    const target = reviewPath?.startsWith('docs/') ? join(root, reviewPath) : resolve(dirname(path), reviewPath || '.')
    if (!reference || target === resolve(path) || !evidenceExists(root, path, reference)) {
      errors.push(`${label} has missing or invalid independent review evidence`)
    }
  }
}

function validateCompactCoverage(root, planPath, markdown, taskFiles, errors) {
  const rows = sectionBody(markdown, '验收标准追踪矩阵').split(/\r?\n/).filter((line) => line.trim().startsWith('|'))
  const ownerColumn = rows.length ? markdownTableCells(rows[0]).indexOf('计划承接') : -1
  if (ownerColumn < 0) {
    errors.push(`${pathLabel(root, planPath)} has no acceptance-to-task mapping`)
    return
  }
  const tasks = new Map(taskFiles.map((path) => {
    const body = readFileSync(path, 'utf8')
    return [parseFrontmatter(body).feat_id, { body, metadata: parseFrontmatter(body) }]
  }))
  for (const row of rows.filter((line) => /^\|\s*AC-\d+[^|]*\|/.test(line))) {
    const cells = markdownTableCells(row)
    const ac = cells[0].replaceAll('`', '')
    const owners = (cells[ownerColumn] ?? '').replaceAll('`', '').split(/[,，、\s]+/).filter(Boolean)
    if (owners.length === 0) errors.push(`${pathLabel(root, planPath)} has no task for ${ac}`)
    for (const owner of owners) {
      const task = tasks.get(owner)
      if (!task || task.metadata.status === 'deprecated') {
        errors.push(`${pathLabel(root, planPath)} maps ${ac} to missing or deprecated task ${owner}`)
      } else if (!new RegExp(`\\b${escapeRegExp(ac)}(?![\\w-])`).test(sectionBody(task.body, '验收标准'))) {
        errors.push(`${pathLabel(root, planPath)} maps ${ac} to ${owner} without matching task acceptance`)
      }
    }
  }
}

function validatePlan(root, path, markdown, contract, errors) {
  const metadata = parseFrontmatter(markdown)
  if (metadata.workflow_type !== 'create-dev-plan') return false

  const label = pathLabel(root, path)
  const planDirectory = dirname(path)
  const accepted = metadata.status === 'accepted' || metadata.status === 'released'
  const version = metadata.workflow_version ?? '1'
  if (!(contract.plan.supported_workflow_versions ?? [1]).map(String).includes(version)) {
    errors.push(`${label} has unsupported workflow_version ${version}`)
    return true
  }
  const compact = version === '2'

  if (!contract.plan.readme_frontmatter_status.includes(metadata.status)) {
    errors.push(`${label} has invalid plan status ${metadata.status ?? '<missing>'}`)
  }

  for (const section of contract.plan.feature_readme_required_sections) {
    if (!hasSecondLevelHeading(markdown, section)) errors.push(`${label} is missing section "${section}"`)
  }

  const expectedStateHeading = `## ${contract.auto_dev.readme_section}`
  if (!compact && !markdown.split(/\r?\n/).includes(expectedStateHeading)) {
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

  for (const row of compact ? [] : acceptanceRows) {
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
    const taskMarkdown = readFileSync(taskPath, 'utf8')
    const taskMetadata = parseFrontmatter(taskMarkdown)
    if (!taskMetadata.status) continue
    if (!contract.plan.task_file_status.includes(taskMetadata.status)) {
      errors.push(`${pathLabel(root, taskPath)} has invalid task status ${taskMetadata.status}`)
    } else if (accepted && taskMetadata.status !== 'done' && taskMetadata.status !== 'deprecated') {
      errors.push(`${label} is ${metadata.status} while ${pathLabel(root, taskPath)} is ${taskMetadata.status}`)
    }
    if (compact) validateCompactTask(root, taskPath, taskMarkdown, contract, errors)
  }

  if (compact) {
    validateCompactCoverage(root, path, markdown, taskFiles, errors)
    if (!['true', 'false', undefined].includes(metadata.uat_required)) errors.push(`${label} has invalid uat_required`)
    if (accepted && metadata.uat_required === 'true' && (!metadata.uat_evidence || !evidenceExists(root, path, metadata.uat_evidence))) {
      errors.push(`${label} requires UAT evidence before acceptance`)
    }
    if (accepted && !taskFiles.some((task) => parseFrontmatter(readFileSync(task, 'utf8')).status)) {
      errors.push(`${label} has no tasks to accept`)
    }
    return true
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

export function getWorkflowStatus(root = defaultRoot) {
  const plans = collectFiles(join(root, 'docs'), (path) => path.endsWith(`${sep}README.md`), new Set(['backup', 'reviews', 'evidence']))
  return plans.flatMap((planPath) => {
    if (parseFrontmatter(readFileSync(planPath, 'utf8')).workflow_type !== 'create-dev-plan') return []
    return readdirSync(dirname(planPath), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
      .flatMap((entry) => {
        const path = join(dirname(planPath), entry.name)
        const metadata = parseFrontmatter(readFileSync(path, 'utf8'))
        return metadata.status ? [{ file: pathLabel(root, path), status: metadata.status, review: metadata.review_evidence ?? '' }] : []
      })
  })
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
    if (process.argv.includes('--status')) {
      console.log('| Task | Status | Review evidence |\n| --- | --- | --- |')
      for (const task of getWorkflowStatus(cliRoot(process.argv.slice(2)))) console.log(`| ${task.file} | ${task.status} | ${task.review} |`)
    } else console.log(`workflow:check pass (${result.plans} plans, ${result.specs} standalone specs, ${result.skills} Skill documents)`)
  }
}
