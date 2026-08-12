import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { checkWorkflowConsistency } from '../check-workflow-consistency.mjs'

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
