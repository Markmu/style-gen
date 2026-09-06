import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { checkWorkflowConsistency, getWorkflowStatus } from '../check-workflow-consistency.mjs'

function write(root, path, content) {
  const target = join(root, path)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content)
}

function createFixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'style-gen-workflow-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const contract = {
    version: 'test',
    new_feature: {
      workflow_type: 'new-feature',
      frontmatter_status: ['draft', 'approved', 'in-progress', 'done'],
      required_frontmatter_fields: ['workflow_type', 'spec_id', 'title', 'type', 'created', 'status', 'context'],
      required_sections: ['意图', '边界', '需求变更', '代码地图', '任务清单', '验证命令', '验收标准'],
    },
    plan: {
      readme_frontmatter_status: ['draft', 'accepted', 'released'],
      task_file_status: ['ready-to-dev', 'in-progress', 'review', 'done', 'deprecated'],
      acceptance_status: ['planned', 'in-progress', 'done', 'waived'],
      feature_readme_required_sections: ['计划入口', '执行拓扑', '验收标准追踪矩阵', '功能索引', '开发状态机', '全局护栏', '执行前置与全局验证', '未决策项与变更记录'],
    },
    auto_dev: { readme_section: '5. 开发状态机' },
  }

  write(root, '.agents/contracts/workflow-schema.json', `${JSON.stringify(contract, null, 2)}\n`)
  const mirror = options.driftMirror ? { ...contract, version: 'drifted' } : contract
  write(root, '.claude/contracts/workflow-schema.json', `${JSON.stringify(mirror, null, 2)}\n`)
  write(root, '.agents/skills/example/SKILL.md', options.legacyOwner ? 'Read `.claude/contracts/workflow-schema.json`.' : 'Read `.agents/contracts/workflow-schema.json`.')
  write(root, '.claude/skills/example/SKILL.md', 'Read `.agents/contracts/workflow-schema.json`.')
  write(root, 'docs/architecture.md', '# Architecture\n')
  write(root, 'docs/plan/reviews/plan-01-review.md', '# Review\n')
  write(root, 'docs/plan/plan-01.md', '---\nstatus: done\n---\n\n# Task\n')
  write(root, 'docs/plan/README.md', `---
workflow_type: create-dev-plan
status: accepted
source_architecture: docs/architecture.md
---

# Plan

## 1. 计划入口
## 2. 执行拓扑
## 3. 验收标准追踪矩阵
| AC-ID | 当前状态 |
| --- | --- |
| AC-01 | ${options.plannedAcceptance ? 'planned' : 'done'} |
## 4. 功能索引
## 5. 开发状态机
| FEAT | 当前步骤 | red | implement | green | review | 最近证据 |
| --- | --- | --- | --- | --- | --- | --- |
| plan-01 | done | done | done | done | done | \`reviews/plan-01-review.md\` |
## 6. 全局护栏
## 7. 执行前置与全局验证
## 8. 未决策项与变更记录
`)

  return root
}

test('accepts a consistent completed plan and shared contract', (t) => {
  const result = checkWorkflowConsistency(createFixture(t))
  assert.deepEqual(result.errors, [])
  assert.equal(result.plans, 1)
})

test('rejects accepted plans with planned acceptance rows', (t) => {
  const result = checkWorkflowConsistency(createFixture(t, { plannedAcceptance: true }))
  assert.ok(result.errors.some((error) => error.includes('AC-01 remains planned')))
})

test('rejects compatibility contract references from project Skills', (t) => {
  const result = checkWorkflowConsistency(createFixture(t, { legacyOwner: true }))
  assert.ok(result.errors.some((error) => error.includes('compatibility contract')))
})

test('rejects contract mirror drift', (t) => {
  const result = checkWorkflowConsistency(createFixture(t, { driftMirror: true }))
  assert.ok(result.errors.some((error) => error.includes('mirror differs')))
})

function createCompactFixture(t) {
  const root = createFixture(t)
  const contract = JSON.parse(readFileSync(new URL('../../.agents/contracts/workflow-schema.json', import.meta.url), 'utf8'))
  for (const provider of ['.agents', '.claude']) write(root, `${provider}/contracts/workflow-schema.json`, JSON.stringify(contract))
  const readme = readFileSync(join(root, 'docs/plan/README.md'), 'utf8')
    .replace('status: accepted', 'status: accepted\nworkflow_version: 2\nuat_required: false')
    .replace(/\| AC-ID \| 当前状态 \|[\s\S]*?(?=## 4)/, '| AC-ID | 计划承接 |\n| --- | --- |\n| AC-01 | plan-01 |\n')
    .replace(/\| FEAT \|[\s\S]*?(?=## 6)/, 'Run `pnpm workflow:status`; no manually maintained state rows.\n')
  write(root, 'docs/plan/README.md', readme)
  const sections = [...contract.plan.feature_task_required_sections, contract.plan.compact.verification_section]
  write(root, 'docs/plan/plan-01.md', `---
feat_id: plan-01
status: done
red_evidence: plan-01.md#验证记录
green_evidence: plan-01.md#验证记录
review_evidence: reviews/plan-01-review.md
---
${sections.map((section) => `## ${section}\n${section === '验收标准' ? '- [x] AC-01 Expected behavior verified' : 'Recorded evidence and context'}\n`).join('\n')}`)
  return root
}

test('accepts compact plans without duplicate case documents or state rows', (t) => {
  assert.deepEqual(checkWorkflowConsistency(createCompactFixture(t)).errors, [])
})

test('compact completion requires both verification phases and independent review', (t) => {
  for (const field of ['red_evidence', 'green_evidence', 'review_evidence']) {
    const root = createCompactFixture(t)
    const path = join(root, 'docs/plan/plan-01.md')
    writeFileSync(path, readFileSync(path, 'utf8').replace(new RegExp(`^${field}:.*\\n`, 'm'), ''))
    assert.ok(checkWorkflowConsistency(root).errors.length > 0, field)
  }
})

test('compact evidence must exist and review cannot cite the implementation record itself', (t) => {
  for (const reference of ['missing.md', 'plan-01.md#验证记录', '.', 'reviews/plan-01-review.md#missing']) {
    const root = createCompactFixture(t)
    const path = join(root, 'docs/plan/plan-01.md')
    writeFileSync(path, readFileSync(path, 'utf8').replace('reviews/plan-01-review.md', reference))
    assert.ok(checkWorkflowConsistency(root).errors.some((error) => error.includes('independent review')), reference)
  }
})

test('explicit UAT requirements still block compact acceptance without evidence', (t) => {
  const root = createCompactFixture(t)
  const path = join(root, 'docs/plan/README.md')
  writeFileSync(path, readFileSync(path, 'utf8').replace('uat_required: false', 'uat_required: true'))
  assert.ok(checkWorkflowConsistency(root).errors.some((error) => error.includes('UAT evidence')))
  write(root, 'docs/plan/uat.md', '# UAT results\n')
  writeFileSync(path, readFileSync(path, 'utf8').replace('uat_required: true', 'uat_required: true\nuat_evidence: uat.md'))
  assert.deepEqual(checkWorkflowConsistency(root).errors, [])
})

test('compact plans reject unfinished task acceptance and unknown workflow versions', (t) => {
  const root = createCompactFixture(t)
  const task = join(root, 'docs/plan/plan-01.md')
  writeFileSync(task, readFileSync(task, 'utf8').replace('[x]', '[ ]'))
  assert.ok(checkWorkflowConsistency(root).errors.some((error) => error.includes('incomplete acceptance')))
  const readme = join(root, 'docs/plan/README.md')
  writeFileSync(readme, readFileSync(readme, 'utf8').replace('workflow_version: 2', 'workflow_version: 99'))
  assert.ok(checkWorkflowConsistency(root).errors.some((error) => error.includes('unsupported workflow_version')))
})

test('generated status reads task files rather than stale README state rows', (t) => {
  const root = createFixture(t)
  write(root, 'docs/plan/plan-01.md', '---\nstatus: in-progress\n---\n')
  assert.deepEqual(getWorkflowStatus(root), [{ file: 'docs/plan/plan-01.md', status: 'in-progress', review: '' }])
})

test('compact plans retain acceptance coverage when status columns are removed', (t) => {
  for (const mapping of ['plan-missing', '']) {
    const root = createCompactFixture(t)
    const path = join(root, 'docs/plan/README.md')
    writeFileSync(path, readFileSync(path, 'utf8').replace('| AC-01 | plan-01 |', `| AC-01 | ${mapping} |`))
    assert.ok(checkWorkflowConsistency(root).errors.length > 0)
  }
  const root = createCompactFixture(t)
  const task = join(root, 'docs/plan/plan-01.md')
  writeFileSync(task, readFileSync(task, 'utf8').replace('AC-01 Expected', 'AC-02 Expected'))
  assert.ok(checkWorkflowConsistency(root).errors.some((error) => error.includes('without matching task acceptance')))
})

test('compact acceptance records resolved waivers and rejects empty waiver reasons', (t) => {
  const root = createCompactFixture(t)
  const task = join(root, 'docs/plan/plan-01.md')
  const original = readFileSync(task, 'utf8')
  writeFileSync(task, original.replace('AC-01 Expected behavior verified', 'AC-01 (waived: explicitly approved scope exclusion)'))
  assert.deepEqual(checkWorkflowConsistency(root).errors, [])
  writeFileSync(task, original.replace('AC-01 Expected behavior verified', 'AC-01 (waived: )'))
  assert.ok(checkWorkflowConsistency(root).errors.some((error) => error.includes('without a reason')))
})
