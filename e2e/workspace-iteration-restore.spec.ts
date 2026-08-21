import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAnalysisPolling,
  mockAuthSession,
  mockGenerationCreateCapture,
  mockGenerationPolling,
  mockIterationDetail,
  mockIterationList,
  type MockIterationDetail,
  type MockIterationListItem,
} from './helpers/mock-api'
import { gotoWorkspace } from './helpers/workspace-actions'

/**
 * plan-04 — “继续此方向 / 修正并继续”恢复与守卫 E2E（red → green）
 *
 * 来源：docs/13-Iteration-Memory闭环补全/13-2-实现计划-Iteration-Memory闭环补全/plan-04-继续此方向恢复与守卫.md
 * §5 E2E 验收 + 架构 §6.3（恢复链路、三豁免、确认对话框、恢复零写请求、
 * 恢复后主动生成形成新 Iteration）与 §6.2/§7.2（IterationDetail DTO 含
 * sourceTemplateId，AC-02 数据来源）。
 *
 * 场景：direct 恢复（空工作台，不弹确认，快照全量恢复且零自动生成请求）、
 * confirm 弹替换确认（当前工作台存在不同未完成内容；展示两侧提示摘要；
 * 取消后详情与工作台两侧零变更、停留详情；确认后切换为所选快照）、
 * failed 详情“修正并继续”走同一链路、恢复→修改提示→主动生成发出
 * POST /api/generation（携带恢复后的 prompt 与上下文；源自 Style Memory 的
 * 迭代携带 sourceTemplateId）、重复恢复当前 Iteration 走 direct。
 *
 * ---------------------------------------------------------------------------
 * 详情侧复用 plan-03 已交付契约：[data-testid="iteration-detail-panel"]
 * （data-status / data-iteration-id）、[data-testid="iteration-detail-actions"]。
 *
 * plan-04 需提供的选择器契约（red → green 对齐用）：
 * - completed 详情动作：[data-testid="iteration-detail-actions"] 内按钮
 *   “Continue this direction”（/continue (this |the )?direction/i）
 * - failed 详情动作：同一动作区按钮 “Fix and continue”
 *   （/fix (and|&) continue|correct (and|&) continue/i，同一恢复链路）
 * - 替换确认对话框：[data-testid="replace-confirm-dialog"]（role=dialog），
 *   内含当前方向与目标方向的提示摘要（两侧完整短提示文本可见）、
 *   取消按钮（/cancel|stay|keep current/i）与确认按钮
 *   （/continue|switch|replace/i，语义为“继续切换”）
 * - 工作台上一轮结果展示位：[data-testid="previous-result-preview"]
 *   （恢复携带 resultFileUrl 的迭代时渲染，内含 img src=resultFileUrl）
 * - 工作台快照消费复用既有可观察位：prompt-card（提示文本）、
 *   “Variable negative_prompt” 输入（排除项）、Render Dock 的
 *   “Aspect Ratio”/“Quality” 选择器（参数）、Reference Canvas 的
 *   Reference img（来源上下文）
 * ---------------------------------------------------------------------------
 */

/** 既有 V2 recipe fixture（analysis-v2-completed.json.recipe）作为详情快照内容 */
const V2_RECIPE = (loadFixture('analysis-v2-completed.json') as { recipe: object }).recipe

/** 既有工作台持久化通道（src/hooks/use-workspace-state.ts：STORAGE_KEY / STORAGE_VERSION） */
const WORKSPACE_STORAGE_KEY = 'style-gen-workspace-state'
const WORKSPACE_STORAGE_VERSION = 4

/** 目标迭代（恢复源）的提示与排除项 — 保持简短，对话框摘要需完整可见 */
const TARGET_PROMPT = 'Neon cityscape at dusk with amber towers'
const TARGET_NEGATIVE = 'watermark, distorted glass'

/** 当前工作台未完成内容的提示与排除项（与目标不同 → confirm 分支） */
const CURRENT_PROMPT = 'Lavender haze editorial study'
const CURRENT_NEGATIVE = 'harsh shadows'
const CURRENT_REFERENCE_URL = 'https://cdn.example.com/references/current-unfinished/original.png'

const ITERATION_VARIABLES = [
  { name: 'subject', label: 'Subject', defaultValue: 'amber bottle', sourceField: 'subject' },
  {
    name: 'environment',
    label: 'Environment',
    defaultValue: 'quiet studio table',
    sourceField: 'environment',
  },
]

function iterationDetail(overrides: {
  id: string
  status: MockIterationDetail['status']
  prompt: string
  errorMessage?: string
  sourceTemplateId?: string
}): MockIterationDetail {
  const { id, status, prompt } = overrides
  return {
    id,
    analysisTaskId: `analysis-${id}`,
    status,
    promptSnapshot: prompt,
    negativePromptSnapshot: TARGET_NEGATIVE,
    params: { aspectRatio: '16:9', quality: 'hd' },
    modelName: 'black-forest-2.5',
    resultFileUrl:
      status === 'completed' ? `https://cdn.example.com/generated/${id}/result.webp` : null,
    errorMessage:
      status === 'failed' ? overrides.errorMessage ?? 'Provider timeout while rendering' : null,
    recipe: V2_RECIPE,
    recipeSource: 'snapshot',
    variables: ITERATION_VARIABLES,
    variablesSource: 'snapshot',
    sourceImageUrl: `https://cdn.example.com/references/${id}/original.png`,
    sourceAssetId: `asset-${id}`,
    sourceTemplateId: overrides.sourceTemplateId ?? null,
    sourceTemplateName: overrides.sourceTemplateId ? 'Saved Style Memory direction' : null,
    savedTemplate: null,
    analysisTemplateVariables: ITERATION_VARIABLES,
    createdAt: '2024-03-03T09:00:00.000Z',
    updatedAt: '2024-03-03T09:00:30.000Z',
  }
}

function iterationItem(overrides: {
  id: string
  status: MockIterationListItem['status']
  promptSummary: string
}): MockIterationListItem {
  return {
    id: overrides.id,
    status: overrides.status,
    promptSummary: overrides.promptSummary,
    resultFileUrl:
      overrides.status === 'completed'
        ? `https://cdn.example.com/generated/${overrides.id}/result.webp`
        : null,
    params: { aspectRatio: '16:9', quality: 'hd' },
    createdAt: '2024-03-03T09:00:00.000Z',
  }
}

/**
 * 当前工作台的未完成内容（confirm 分支前置）：按 use-workspace-state 的
 * WorkspacePersistedState v4 形态写入既有 sessionStorage 通道。
 */
const SEEDED_WORKSPACE_STATE = {
  version: WORKSPACE_STORAGE_VERSION,
  assetId: 'current-unfinished-asset',
  referenceImageUrl: CURRENT_REFERENCE_URL,
  analysisTaskId: 'current-unfinished-analysis',
  recipe: null,
  promptText: CURRENT_PROMPT,
  negativePromptText: CURRENT_NEGATIVE,
  analysisTemplateContent: null,
  analysisTemplateVariables: [],
  analysisTemplateStatus: null,
  analysisTemplateReason: null,
  generationTaskId: null,
  v2PromptState: null,
}

async function seedUnfinishedWorkspace(page: Page) {
  await page.evaluate(
    (entry: { key: string; value: string }) => {
      window.sessionStorage.setItem(entry.key, entry.value)
    },
    { key: WORKSPACE_STORAGE_KEY, value: JSON.stringify(SEEDED_WORKSPACE_STATE) },
  )
}

async function readWorkspacePromptText(page: Page): Promise<string | null> {
  return page.evaluate((key: string) => {
    try {
      const raw = window.sessionStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { promptText?: string }
      return parsed.promptText ?? null
    } catch {
      return null
    }
  }, WORKSPACE_STORAGE_KEY)
}

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function mockCdnImages(page: Page) {
  await page.route('https://cdn.example.com/**', async (route) => {
    if (
      route.request().resourceType() === 'image' ||
      /\.(png|jpg|jpeg|webp)$/.test(route.request().url())
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: pixel,
      })
      return
    }
    await route.continue()
  })
}

async function openIterations(page: Page, query = '') {
  try {
    await page.goto(`/workspace/iterations${query}`, { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }

  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
}

function iterationItems(page: Page, status?: MockIterationListItem['status']) {
  return status
    ? page.locator(`[data-testid="iteration-list-item"][data-status="${status}"]`)
    : page.getByTestId('iteration-list-item')
}

function detailPanel(page: Page) {
  return page.getByTestId('iteration-detail-panel')
}

/** completed 详情主动作（plan-04 primaryActions 契约） */
function continueDirectionButton(page: Page) {
  return page
    .getByTestId('iteration-detail-actions')
    .getByRole('button', { name: /continue (this |the )?direction/i })
}

/** failed 详情主动作（同一恢复链路） */
function fixAndContinueButton(page: Page) {
  return page.getByTestId('iteration-detail-actions').getByRole('button', {
    name: /fix (and|&) continue|correct (and|&) continue/i,
  })
}

/** 替换确认对话框（plan-04 契约） */
function replaceConfirmDialog(page: Page) {
  return page.getByTestId('replace-confirm-dialog')
}

function dialogCancelButton(page: Page) {
  return replaceConfirmDialog(page).getByRole('button', {
    name: /cancel|stay|keep current/i,
  })
}

function dialogConfirmButton(page: Page) {
  return replaceConfirmDialog(page).getByRole('button', {
    name: /continue|switch|replace/i,
  })
}

function appShell(page: Page) {
  return page.getByTestId('app-shell')
}

function promptCard(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('prompt-card')
}

function renderDock(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('output-card')
}

function referenceColumn(page: Page) {
  return appShell(page).getByRole('region', { name: 'Reference Canvas column' })
}

/** 工作台“上一轮结果”展示位（plan-04 契约：恢复后原结果保留可见） */
function previousResultPreview(page: Page) {
  return page.getByTestId('previous-result-preview')
}

function generationPromptEditor(page: Page) {
  return promptCard(page).getByLabel('Full Generation Prompt')
}

function generateButton(page: Page) {
  return renderDock(page).getByRole('button', { name: /^Generate$/i })
}

async function openDetail(page: Page, summary: string) {
  await iterationItems(page).filter({ hasText: summary }).click()
  await expect(detailPanel(page)).toBeVisible()
}

/** 恢复落地断言：回工作台且快照逐位恢复（提示/排除项/参数/来源/上一轮结果） */
async function expectWorkspaceRestoredSnapshot(page: Page, detail: MockIterationDetail) {
  await expect(appShell(page)).toBeVisible({ timeout: 15000 })
  await expect(promptCard(page)).toContainText(detail.promptSnapshot, { timeout: 15000 })
  await expect(page.getByLabel('Variable negative_prompt')).toHaveValue(
    detail.negativePromptSnapshot,
  )
  await expect(renderDock(page).getByLabel('Aspect Ratio')).toHaveValue(detail.params.aspectRatio)
  await expect(renderDock(page).getByLabel('Quality')).toHaveValue(detail.params.quality)
  await expect(referenceColumn(page).getByRole('img', { name: 'Reference' })).toHaveAttribute(
    'src',
    detail.sourceImageUrl as string,
  )
  if (detail.resultFileUrl) {
    await expect(previousResultPreview(page).locator('img')).toHaveAttribute(
      'src',
      detail.resultFileUrl,
    )
  }
}

test.describe('plan-04 continue-this-direction restore and workspace guard', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    // 每个用例独立 browser context，sessionStorage 天然为空（空工作台）；
    // 需要未完成内容的用例在进入详情前显式 seed 既有持久化通道。
    await mockAuthSession(page)
    await mockCdnImages(page)
  })

  test('TC-4.1 direct restore from an empty workspace skips the confirm dialog and restores the full snapshot', async ({ page }) => {
    const capture = await mockGenerationCreateCapture(page, 'tc41-no-auto-generation')
    const detail = iterationDetail({
      id: 'iter-restore-source',
      status: 'completed',
      prompt: TARGET_PROMPT,
    })
    await mockIterationList(page, [
      iterationItem({ id: 'iter-restore-source', status: 'completed', promptSummary: 'Neon cityscape at dusk' }),
    ])
    await mockIterationDetail(page, detail)

    await openIterations(page)
    await openDetail(page, 'Neon cityscape at dusk')
    await expect(detailPanel(page)).toHaveAttribute('data-status', 'completed')

    await expect(continueDirectionButton(page)).toBeVisible()
    await continueDirectionButton(page).click()

    // 空工作台 → 三豁免之“current 为空”：不弹替换确认，直接回工作台
    await expect(replaceConfirmDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })
    await expectWorkspaceRestoredSnapshot(page, detail)

    // 恢复动作本身不触发任何生成请求
    expect(capture.requests, 'restore must not issue any generation request').toHaveLength(0)
  })

  test('TC-4.2 restoring over different unfinished content opens the replace confirm with both prompt summaries', async ({ page }) => {
    const capture = await mockGenerationCreateCapture(page, 'tc42-none')
    const detail = iterationDetail({
      id: 'iter-restore-source',
      status: 'completed',
      prompt: TARGET_PROMPT,
    })
    await mockIterationList(page, [
      iterationItem({ id: 'iter-restore-source', status: 'completed', promptSummary: 'Neon cityscape at dusk' }),
    ])
    await mockIterationDetail(page, detail)

    await openIterations(page)
    // 当前工作台存在不同的未完成内容（既有持久化通道）
    await seedUnfinishedWorkspace(page)
    await openDetail(page, 'Neon cityscape at dusk')

    await continueDirectionButton(page).click()

    // 守卫返回 confirm：弹出替换确认，展示当前方向与目标方向的提示摘要
    const dialog = replaceConfirmDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(CURRENT_PROMPT)
    await expect(dialog).toContainText(TARGET_PROMPT)
    await expect(dialogCancelButton(page)).toBeVisible()
    await expect(dialogConfirmButton(page)).toBeVisible()

    // 未确认：停留详情页，未发起任何生成请求
    await expect(page).toHaveURL(/\/workspace\/iterations/)
    expect(capture.requests, 'no generation request before confirming').toHaveLength(0)
  })

  test('TC-4.3 cancelling the replace confirm keeps the detail open and the workspace untouched', async ({ page }) => {
    const capture = await mockGenerationCreateCapture(page, 'tc43-none')
    const detail = iterationDetail({
      id: 'iter-restore-source',
      status: 'completed',
      prompt: TARGET_PROMPT,
    })
    await mockIterationList(page, [
      iterationItem({ id: 'iter-restore-source', status: 'completed', promptSummary: 'Neon cityscape at dusk' }),
    ])
    await mockIterationDetail(page, detail)

    await openIterations(page)
    await seedUnfinishedWorkspace(page)
    await openDetail(page, 'Neon cityscape at dusk')
    await continueDirectionButton(page).click()
    await expect(replaceConfirmDialog(page)).toBeVisible()

    await dialogCancelButton(page).click()

    // 详情侧零变更：对话框关闭，仍停留详情且展示同一 Iteration
    await expect(replaceConfirmDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/workspace\/iterations/)
    await expect(detailPanel(page)).toBeVisible()
    await expect(detailPanel(page)).toHaveAttribute('data-iteration-id', 'iter-restore-source')

    // 工作台侧零变更：既有持久化通道仍是当前未完成内容
    expect(await readWorkspacePromptText(page)).toBe(CURRENT_PROMPT)

    // 用户自行回到工作台：看到的仍是原未完成内容
    await mockAnalysisPolling(page, 'current-unfinished-analysis', {
      ...(loadFixture('analysis-completed.json') as object),
      id: 'current-unfinished-analysis',
      status: 'completed',
      promptText: CURRENT_PROMPT,
      negativePromptText: CURRENT_NEGATIVE,
    })
    await gotoWorkspace(page)
    await expect(promptCard(page)).toContainText(CURRENT_PROMPT, { timeout: 15000 })

    expect(capture.requests, 'cancel must not issue any generation request').toHaveLength(0)
  })

  test('TC-4.4 confirming the replace switches the workspace to the target snapshot without generating', async ({ page }) => {
    const capture = await mockGenerationCreateCapture(page, 'tc44-no-auto-generation')
    const detail = iterationDetail({
      id: 'iter-restore-source',
      status: 'completed',
      prompt: TARGET_PROMPT,
    })
    await mockIterationList(page, [
      iterationItem({ id: 'iter-restore-source', status: 'completed', promptSummary: 'Neon cityscape at dusk' }),
    ])
    await mockIterationDetail(page, detail)

    await openIterations(page)
    await seedUnfinishedWorkspace(page)
    await openDetail(page, 'Neon cityscape at dusk')
    await continueDirectionButton(page).click()
    await expect(replaceConfirmDialog(page)).toBeVisible()

    await dialogConfirmButton(page).click()

    // 确认后应用恢复载荷并导航回工作台：快照切换为目标 Iteration
    await expect(replaceConfirmDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })
    await expectWorkspaceRestoredSnapshot(page, detail)
    await expect(promptCard(page)).not.toContainText(CURRENT_PROMPT)

    // 确认与恢复均不触发生成请求
    expect(capture.requests, 'confirmed restore must not issue any generation request').toHaveLength(0)
  })

  test('TC-4.5 the failed detail Fix-and-continue action runs the same restore chain without submitting', async ({ page }) => {
    const capture = await mockGenerationCreateCapture(page, 'tc45-no-auto-generation')
    const prompt = 'Neon cityscape retry with corrected framing'
    const detail = iterationDetail({
      id: 'iter-failed-retry',
      status: 'failed',
      prompt,
      errorMessage: 'Provider timeout while rendering',
    })
    await mockIterationList(page, [
      iterationItem({ id: 'iter-failed-retry', status: 'failed', promptSummary: 'Neon cityscape retry attempt' }),
    ])
    await mockIterationDetail(page, detail)

    await openIterations(page)
    await openDetail(page, 'Neon cityscape retry attempt')
    await expect(detailPanel(page)).toHaveAttribute('data-status', 'failed')

    // failed 详情主动作为“修正并继续”，与 completed 共用同一条恢复链路
    await expect(fixAndContinueButton(page)).toBeVisible()
    await fixAndContinueButton(page).click()

    await expect(replaceConfirmDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })
    await expect(promptCard(page)).toContainText(prompt, { timeout: 15000 })
    await expect(referenceColumn(page).getByRole('img', { name: 'Reference' })).toHaveAttribute(
      'src',
      detail.sourceImageUrl as string,
    )

    // failed 无结果图 → 无上一轮结果图；不自动提交
    await expect(page.locator('img[src*="/generated/iter-failed-retry/"]')).toHaveCount(0)
    expect(capture.requests, 'fix-and-continue must not auto-submit').toHaveLength(0)
  })

  test('TC-4.6 modifying the restored prompt and generating issues a single POST with the restored context', async ({ page }) => {
    const prompt = 'Watercolor petals study with soft window light'
    const detail = iterationDetail({ id: 'iter-continue-new', status: 'completed', prompt })
    const capture = await mockGenerationCreateCapture(page, 'new-iteration-task')
    await mockGenerationPolling(page, 'new-iteration-task', {
      id: 'new-iteration-task',
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })
    await mockIterationList(page, [
      iterationItem({ id: 'iter-continue-new', status: 'completed', promptSummary: 'Watercolor petals study' }),
    ])
    await mockIterationDetail(page, detail)

    await openIterations(page)
    await openDetail(page, 'Watercolor petals study')
    await continueDirectionButton(page).click()
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })

    // 用户主动修改前：零生成请求
    expect(capture.requests, 'restore must not issue any generation request').toHaveLength(0)

    const modifiedPrompt = 'Watercolor petals study with brighter window light and dew'
    await expect(generationPromptEditor(page)).toBeVisible({ timeout: 15000 })
    await generationPromptEditor(page).fill(modifiedPrompt)

    await expect(generateButton(page)).toBeEnabled()
    await generateButton(page).click()

    // 主动生成走既有 POST /api/generation，形成新 Iteration（原记录不动）
    await expect.poll(() => capture.requests.length, { timeout: 15000 }).toBe(1)
    const body = capture.requests[0].body
    expect(body.promptText).toBe(modifiedPrompt)
    expect(body.negativePromptText).toBe(detail.negativePromptSnapshot)
    expect(body.analysisTaskId).toBe(detail.analysisTaskId)
    // 恢复的存量迭代无 model 字段，重新生成回退 models.json 默认模型
    expect(body.params).toEqual({ aspectRatio: '16:9', quality: 'hd', model: 'flux-2-dev' })
  })

  test('TC-4.7 generating after restoring a Style Memory sourced iteration carries sourceTemplateId (AC-02)', async ({ page }) => {
    const prompt = 'Amber product hero from saved style memory'
    const detail = iterationDetail({
      id: 'iter-template-origin',
      status: 'completed',
      prompt,
      sourceTemplateId: 'tpl-style-memory',
    })
    const capture = await mockGenerationCreateCapture(page, 'template-origin-task')
    await mockGenerationPolling(page, 'template-origin-task', {
      id: 'template-origin-task',
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })
    await mockIterationList(page, [
      iterationItem({ id: 'iter-template-origin', status: 'completed', promptSummary: 'Amber product hero' }),
    ])
    await mockIterationDetail(page, detail)

    await openIterations(page)
    await openDetail(page, 'Amber product hero')
    await continueDirectionButton(page).click()
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })

    await expect(generateButton(page)).toBeEnabled()
    await generateButton(page).click()

    // 恢复携带 sourceTemplateId 的迭代后再次生成：请求体还原并携带该标记，
    // 保障记录可按来源 Style Memory 名称检索（AC-02 / PRD 业务规则 4）
    await expect.poll(() => capture.requests.length, { timeout: 15000 }).toBe(1)
    const body = capture.requests[0].body
    expect(body.sourceTemplateId).toBe('tpl-style-memory')
    expect(body.promptText).toBe(prompt)
  })

  test('TC-4.8 restoring the iteration that is already current goes direct without the confirm dialog', async ({ page }) => {
    const detail = iterationDetail({
      id: 'iter-restore-source',
      status: 'completed',
      prompt: TARGET_PROMPT,
    })
    await mockIterationList(page, [
      iterationItem({ id: 'iter-restore-source', status: 'completed', promptSummary: 'Neon cityscape at dusk' }),
    ])
    await mockIterationDetail(page, detail)

    // 第一次恢复（空工作台 → direct）
    await openIterations(page)
    await openDetail(page, 'Neon cityscape at dusk')
    await continueDirectionButton(page).click()
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })
    await expect(promptCard(page)).toContainText(TARGET_PROMPT, { timeout: 15000 })

    // 回到 Iteration Memory 再次恢复同一目标：currentIterationId === target.id
    await openIterations(page)
    await openDetail(page, 'Neon cityscape at dusk')
    await continueDirectionButton(page).click()

    // 三豁免之“已是同一 Iteration”：direct，不弹确认，幂等回工作台
    await expect(replaceConfirmDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })
    await expect(promptCard(page)).toContainText(TARGET_PROMPT, { timeout: 15000 })
  })
})
