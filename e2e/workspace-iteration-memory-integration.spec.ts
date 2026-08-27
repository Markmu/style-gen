import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAuthSession,
  mockGenerationCreateCapture,
  mockGenerationPolling,
  mockIterationDetailSequence,
  mockIterationList,
  mockStyleMemoryDetailCollection,
  mockTemplateCollection,
  type IterationListRequestQuery,
  type MockIterationDetail,
  type MockIterationListItem,
  type MockStyleMemoryDetail,
} from './helpers/mock-api'
import { gotoWorkspace } from './helpers/workspace-actions'

/**
 * plan-06 — 入口接线与全流程集成 E2E（red → green）
 *
 * 来源：docs/13-Iteration-Memory闭环补全/13-2-实现计划-Iteration-Memory闭环补全/plan-06-入口接线与全流程集成.md
 * §5 E2E 验收 + 架构 §4.2（入口与沉淀模块）、§2.3（US-01~US-10 全流程
 * 成功标准）、§9 Phase C（集成回归）。
 *
 * 场景：全流程主线（近期条"查看全部" → 全状态列表 → 搜索/筛选 → 已完成
 * 详情 → 继续此方向（守卫确认）→ 工作台恢复快照 → 修改提示并生成新迭代
 * （断言 POST /api/generation）→ 回到详情保存为 Style Memory → 已保存态 +
 * 打开定位）；近期条入口回归（"查看全部"可达目标路由 + 近期条默认参数
 * completed-only 调用不变 + 无完成结果时入口仍可用）；左侧导航 Iterations
 * 项（存在、可切换、高亮，不破坏既有导航项）。
 *
 * ---------------------------------------------------------------------------
 * 复用 plan-02~05 已交付契约（不重复造轮子）：
 * - 列表：heading "Iteration Memory"、textbox "Search iterations…"、
 *   radiogroup "Status filter"、[data-testid="iteration-list-item"][data-status]
 * - 详情：[data-testid="iteration-detail-panel"][data-status][data-iteration-id]、
 *   [data-testid="iteration-detail-actions"]（Continue this direction /
 *   Save as Style Memory）、[data-testid="replace-confirm-dialog"]、
 *   [data-testid="save-style-memory-dialog"]、[data-testid="iteration-saved-state"]
 * - 工作台：prompt-card / "Variable negative_prompt" / Render Dock 参数 /
 *   Reference img / [data-testid="previous-result-preview"] /
 *   "Full Generation Prompt" / Generate 按钮
 * - 近期条：[data-testid="history-strip"] 内按钮 "View all"（已存在，
 *   page.tsx 当前 onViewAll 死链指向 /history —— 本功能要修的点）
 *
 * plan-06 需提供的选择器/行为契约（red → green 对齐用）：
 * - 近期条"查看全部"：点击后导航到 `/workspace/iterations?status=all`
 *   （src/app/workspace/page.tsx 的 onViewAll 接线由 /history 改为目标路由）；
 *   近期条自身继续以默认参数（pageSize=20、无 status —— 服务端 completed-only）
 *   调用列表接口，条目与既有交互不变
 * - 左侧导航 Iterations 项：nav[aria-label="Workspace primary navigation"] 内
 *   link，可访问名匹配 /iteration/i，指向 /workspace/iterations；命中该路由时
 *   aria-current="page"（与既有 Generate / Style Memory Library 项同规则）
 * - 既有导航项 Generate（/workspace）与 Style Memory Library
 *   （/workspace/templates）不回归
 * ---------------------------------------------------------------------------
 */

/** 既有 V2 recipe fixture（analysis-v2-completed.json.recipe）作为详情快照内容 */
const V2_RECIPE = (loadFixture('analysis-v2-completed.json') as { recipe: object }).recipe

/** 既有工作台持久化通道（src/hooks/use-workspace-state.ts：STORAGE_KEY / STORAGE_VERSION） */
const WORKSPACE_STORAGE_KEY = 'style-gen-workspace-state'
const WORKSPACE_STORAGE_VERSION = 4

/** 目标迭代（全流程主角）——提示保持 ≤46 字符，替换确认对话框摘要需完整可见 */
const TARGET_ID = 'iter-integration-target'
const TARGET_PROMPT = 'Neon dusk skyline with amber glass towers'
const TARGET_NEGATIVE = 'watermark, distorted glass'
const MODIFIED_PROMPT = 'Neon dusk skyline with brighter amber glow and dew'

/** 当前工作台未完成内容的提示（与目标不同 → 守卫 confirm 分支） */
const CURRENT_PROMPT = 'Lavender haze editorial study'
const CURRENT_NEGATIVE = 'harsh shadows'

const TEMPLATE_NAME = 'Neon Dusk Integration Memory'

const ITERATION_VARIABLES = [
  { name: 'subject', label: 'Subject', defaultValue: 'amber bottle', sourceField: 'subject' },
  {
    name: 'environment',
    label: 'Environment',
    defaultValue: 'quiet studio table',
    sourceField: 'environment',
  },
]

function integrationDetail(overrides?: {
  savedTemplate?: { id: string; name: string } | null
}): MockIterationDetail {
  return {
    id: TARGET_ID,
    analysisTaskId: `analysis-${TARGET_ID}`,
    status: 'completed',
    promptSnapshot: TARGET_PROMPT,
    negativePromptSnapshot: TARGET_NEGATIVE,
    params: { aspectRatio: '16:9', quality: 'hd' },
    modelName: 'black-forest-2.5',
    resultFileUrl: `https://cdn.example.com/generated/${TARGET_ID}/result.webp`,
    errorMessage: null,
    recipe: V2_RECIPE,
    recipeSource: 'snapshot',
    variables: ITERATION_VARIABLES,
    variablesSource: 'snapshot',
    sourceImageUrl: `https://cdn.example.com/references/${TARGET_ID}/original.png`,
    sourceAssetId: `asset-${TARGET_ID}`,
    sourceTemplateId: null,
    sourceTemplateName: null,
    savedTemplate: overrides?.savedTemplate ?? null,
    analysisTemplateVariables: ITERATION_VARIABLES,
    createdAt: '2024-03-03T09:00:00.000Z',
    updatedAt: '2024-03-03T09:00:30.000Z',
  }
}

/** 保存成功跳转目标：新 Memory 详情（plan-05 详情页契约，plan-02 DTO） */
function savedJourneyMemory(): MockStyleMemoryDetail {
  return {
    id: 'mock-template-1',
    name: TEMPLATE_NAME,
    description: null,
    content: TARGET_PROMPT,
    variables: ITERATION_VARIABLES,
    retainedRules: ['warm amber and sand palette'],
    negativeConstraints: ['watermark', 'distorted glass'],
    styleTokens: ['editorial', 'warm neutral'],
    enhancementHints: [],
    verificationStatus: 'pending_verification',
    representativeGenerationTaskId: null,
    sourceAssetId: `asset-${TARGET_ID}`,
    sourceImageUrl: `https://cdn.example.com/references/${TARGET_ID}/original.png`,
    sourceGenerationTaskId: TARGET_ID,
    sourceGenerationTask: { id: TARGET_ID, createdAt: '2024-03-03T09:00:00.000Z' },
    representativeResult: null,
    usage: { lastUsedAt: null, derivedIterationCount: 0 },
    createdAt: '2024-03-03T09:01:00.000Z',
    updatedAt: '2024-03-03T09:01:00.000Z',
  }
}

function integrationItem(overrides: {
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

/** 三态条目：q=neon 时保留 completed + failed 两条，processing 被收窄 */
const threeStateItems: MockIterationListItem[] = [
  integrationItem({
    id: TARGET_ID,
    status: 'completed',
    promptSummary: 'Neon dusk skyline study',
  }),
  integrationItem({
    id: 'iter-int-processing',
    status: 'processing',
    promptSummary: 'Watercolor petals study',
  }),
  integrationItem({
    id: 'iter-int-failed',
    status: 'failed',
    promptSummary: 'Neon dusk retry attempt',
  }),
]

/** 当前工作台的未完成内容（守卫 confirm 前置）：WorkspacePersistedState v4 形态 */
const SEEDED_WORKSPACE_STATE = {
  version: WORKSPACE_STORAGE_VERSION,
  assetId: 'current-unfinished-asset',
  referenceImageUrl: 'https://cdn.example.com/references/current-unfinished/original.png',
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

function historyStrip(page: Page) {
  return page.getByTestId('history-strip')
}

function viewAllButton(page: Page) {
  return historyStrip(page).getByRole('button', { name: /view all/i })
}

/** 左侧导航（工作台共享布局 workspace/layout.tsx 渲染的 LeftSidebar） */
function primaryNav(page: Page) {
  return page.locator('nav[aria-label="Workspace primary navigation"]')
}

/** plan-06 契约：导航 Iterations 项（可访问名 /iteration/i 的 link） */
function iterationsNavLink(page: Page) {
  return primaryNav(page).getByRole('link', { name: /iteration/i })
}

function iterationItems(page: Page, status?: MockIterationListItem['status']) {
  return status
    ? page.locator(`[data-testid="iteration-list-item"][data-status="${status}"]`)
    : page.getByTestId('iteration-list-item')
}

function searchInput(page: Page) {
  return page.getByRole('textbox', { name: /search iteration/i })
}

function statusFilter(page: Page) {
  return page.getByRole('radiogroup', { name: /status filter|filter by status/i })
}

function detailPanel(page: Page) {
  return page.getByTestId('iteration-detail-panel')
}

function detailActions(page: Page) {
  return page.getByTestId('iteration-detail-actions')
}

function continueDirectionButton(page: Page) {
  return detailActions(page).getByRole('button', { name: /continue (this |the )?direction/i })
}

function replaceConfirmDialog(page: Page) {
  return page.getByTestId('replace-confirm-dialog')
}

function saveStyleMemoryButton(page: Page) {
  return detailActions(page).getByRole('button', { name: /save (as )?style ?memory/i })
}

function saveDialog(page: Page) {
  return page.getByTestId('save-style-memory-dialog')
}

function savedState(page: Page) {
  return page.getByTestId('iteration-saved-state')
}

function openSavedMemoryButton(page: Page) {
  return savedState(page).getByRole('button', { name: /open|view/i })
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

function generationPromptEditor(page: Page) {
  return promptCard(page).getByLabel('Full Generation Prompt')
}

function generateButton(page: Page) {
  return renderDock(page).getByRole('button', { name: /^Generate$/i })
}

async function seedUnfinishedWorkspace(page: Page) {
  await page.evaluate(
    (entry: { key: string; value: string }) => {
      window.sessionStorage.setItem(entry.key, entry.value)
    },
    { key: WORKSPACE_STORAGE_KEY, value: JSON.stringify(SEEDED_WORKSPACE_STATE) },
  )
}

/** 近期条默认参数回归断言：pageSize=20、无 status（服务端 completed-only）、无 q */
async function expectRecentStripDefaultQuery(requests: IterationListRequestQuery[]) {
  await expect
    .poll(
      () =>
        requests.some(
          (query) => query.status === null && query.q === null && query.pageSize === 20,
        ),
      { timeout: 15000 },
    )
    .toBe(true)
}

test.describe('plan-06 entry wiring and full Iteration Memory journey', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    // 每个用例独立 browser context，sessionStorage 天然为空（空工作台）；
    // 需要未完成内容的用例在点击“继续此方向”前显式 seed 既有持久化通道。
    await mockAuthSession(page)
    await mockCdnImages(page)
  })

  test('TC-6.1 full journey: view-all entry → three-state list → search/filter → detail → guarded continue → restore → generate → save as Style Memory → open', async ({ page }) => {
    test.slow()
    const requests: IterationListRequestQuery[] = []
    const newIterationTaskId = 'integration-new-iteration'

    // 全流程 mock：三态列表 + 详情序列（首开未保存 → 重开仍未保存 → 保存后已保存）
    // + 新迭代生成（POST 捕获 + processing 轮询）+ Style Memory 集合（列表/创建）
    await mockIterationList(page, threeStateItems, {
      onRequest: (query) => requests.push(query),
    })
    await mockIterationDetailSequence(page, TARGET_ID, [
      integrationDetail(),
      integrationDetail(),
      integrationDetail({ savedTemplate: { id: 'mock-template-1', name: TEMPLATE_NAME } }),
    ])
    const generationCapture = await mockGenerationCreateCapture(page, newIterationTaskId)
    await mockGenerationPolling(page, newIterationTaskId, {
      id: newIterationTaskId,
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })
    const templates = await mockTemplateCollection(page, [])
    // plan-04：列表页消费 GET /api/templates 新 DTO；集合 mock 继续提供 POST/详情。
    // 此处按集合中的实时记录（含保存后 unshift 的新条目）返回新 DTO 列表。
    await page.route('**/api/templates?**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: templates.templates.map((record) => ({
            id: record.id,
            name: record.name,
            verificationStatus: 'pending_verification',
            retainedRulesPreview: [] as string[],
            variableCount: Array.isArray(record.variables) ? record.variables.length : 0,
            sourceImageUrl: record.sourceImageUrl ?? null,
            representativeImageUrl: null,
            lastUsedAt: null,
            updatedAt: record.updatedAt ?? '2024-01-01T00:00:00.000Z',
          })),
          hasMore: false,
          nextCursor: null,
        }),
      })
    })
    // plan-06：保存成功直接进入新 Memory 详情（plan-05 详情页消费 plan-02
    // StyleMemoryDetail DTO）。后注册的路由优先生效：详情 GET 命中此处返回
    // 新 DTO；POST 创建回退到上方集合 mock 继续捕获。
    await mockStyleMemoryDetailCollection(page, [
      savedJourneyMemory(),
    ])

    // ---- 入口：工作台近期迭代条 ----
    await gotoWorkspace(page)
    await expect(historyStrip(page)).toBeVisible()
    // 等近期条条目就绪（loading→ready 重渲染完成后）再点击，避免点击落在被替换的节点上
    await expect(
      historyStrip(page).getByRole('button', { name: /open history item/i }),
    ).toBeVisible({ timeout: 15000 })
    await viewAllButton(page).click()

    // 近期条“查看全部”→ 完整 Iteration Memory，默认全状态（URL 同步）
    await expect(page).toHaveURL(/\/workspace\/iterations\?status=all/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: /iteration memory/i })).toBeVisible()
    await expect(statusFilter(page).getByRole('radio', { name: /^all/i })).toBeChecked()
    await expect(iterationItems(page, 'completed')).toHaveCount(1)
    await expect(iterationItems(page, 'processing')).toHaveCount(1)
    await expect(iterationItems(page, 'failed')).toHaveCount(1)

    // ---- 搜索 / 筛选组合收窄 ----
    await searchInput(page).fill('neon')
    await expect(iterationItems(page)).toHaveCount(2)
    await statusFilter(page).getByRole('radio', { name: /^completed/i }).check()
    await expect(iterationItems(page)).toHaveCount(1)
    await expect(page).toHaveURL(/q=neon/)
    await expect(page).toHaveURL(/status=completed/)

    // ---- 打开已完成详情 ----
    await iterationItems(page).filter({ hasText: 'Neon dusk skyline study' }).click()
    await expect(detailPanel(page)).toBeVisible()
    await expect(detailPanel(page)).toHaveAttribute('data-status', 'completed')
    await expect(detailPanel(page)).toHaveAttribute('data-iteration-id', TARGET_ID)

    // ---- 继续此方向（守卫确认）----
    // 当前工作台存在不同的未完成内容 → 弹替换确认，展示两侧提示摘要
    await seedUnfinishedWorkspace(page)
    await continueDirectionButton(page).click()

    const dialog = replaceConfirmDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(CURRENT_PROMPT)
    await expect(dialog).toContainText(TARGET_PROMPT)
    await dialog
      .getByRole('button', { name: /continue|switch|replace/i })
      .click()

    // ---- 工作台恢复快照 ----
    await expect(replaceConfirmDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })
    await expect(appShell(page)).toBeVisible({ timeout: 15000 })
    await expect(promptCard(page)).toContainText(TARGET_PROMPT, { timeout: 15000 })
    await expect(page.getByLabel('Variable negative_prompt')).toHaveValue(TARGET_NEGATIVE)
    await expect(renderDock(page).getByLabel('Aspect Ratio')).toHaveValue('16:9')
    await expect(renderDock(page).getByLabel('Quality')).toHaveValue('hd')
    await expect(referenceColumn(page).getByRole('img', { name: 'Reference' })).toHaveAttribute(
      'src',
      `https://cdn.example.com/references/${TARGET_ID}/original.png`,
    )
    await expect(page.getByTestId('previous-result-preview').locator('img')).toHaveAttribute(
      'src',
      `https://cdn.example.com/generated/${TARGET_ID}/result.webp`,
    )

    // 恢复动作本身零生成请求
    expect(generationCapture.requests, 'restore must not issue any generation request').toHaveLength(0)

    // ---- 修改提示并生成新迭代（US-04）----
    await expect(generationPromptEditor(page)).toBeVisible({ timeout: 15000 })
    await generationPromptEditor(page).fill(MODIFIED_PROMPT)
    await expect(generateButton(page)).toBeEnabled()
    await generateButton(page).click()

    await expect.poll(() => generationCapture.requests.length, { timeout: 15000 }).toBe(1)
    const generationBody = generationCapture.requests[0].body
    expect(generationBody.promptText).toBe(MODIFIED_PROMPT)
    expect(generationBody.negativePromptText).toBe(TARGET_NEGATIVE)
    expect(generationBody.analysisTaskId).toBe(`analysis-${TARGET_ID}`)
    // 恢复的存量迭代无 model 字段，重新生成回退 models.json 默认模型
    expect(generationBody.params).toEqual({ aspectRatio: '16:9', quality: 'hd', model: 'flux-2-dev' })

    // ---- 回到详情，保存为 Style Memory（US-07 → plan-06 三步向导）----
    await openIterations(page)
    await expect(page.getByRole('heading', { name: /iteration memory/i })).toBeVisible()
    await iterationItems(page).filter({ hasText: 'Neon dusk skyline study' }).click()
    await expect(detailPanel(page)).toHaveAttribute('data-iteration-id', TARGET_ID)

    // 保存前未出现已保存态
    await expect(savedState(page)).toHaveCount(0)

    await saveStyleMemoryButton(page).click()
    const dialogEl = saveDialog(page)
    await expect(dialogEl).toBeVisible()
    // 三步向导：步骤 2 规则确认 → 步骤 3 命名提交
    await dialogEl.getByRole('button', { name: /下一步/ }).click()
    await dialogEl.getByRole('button', { name: /下一步/ }).click()
    await dialogEl.getByRole('textbox', { name: /名称|name/i }).first().fill(TEMPLATE_NAME)
    await dialogEl.getByRole('button', { name: /^保存|^save/i }).click()

    // 恰好一次 POST /api/templates，提交体携带该次迭代的来源、快照与规则四元组
    await expect.poll(() => templates.createRequests.length, { timeout: 15000 }).toBe(1)
    const templateBody = templates.createRequests[0]
    expect(templateBody.name).toBe(TEMPLATE_NAME)
    expect(templateBody.content).toBe(TARGET_PROMPT)
    expect(templateBody.sourceAssetId).toBe(`asset-${TARGET_ID}`)
    expect(templateBody.sourceGenerationTaskId).toBe(TARGET_ID)
    expect(templateBody.representativeGenerationTaskId).toBeUndefined()
    expect(templateBody.verificationStatus).toBeUndefined()

    // ---- 保存成功直接进入新 Memory 详情（plan-06 → plan-05 详情路由）----
    await expect(page).toHaveURL(/\/workspace\/templates\/mock-template-1$/, { timeout: 15000 })
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: TEMPLATE_NAME })).toBeVisible()
  })

  test('TC-6.2 recent-strip View all reaches the full list with default all status while the strip keeps its completed-only default query', async ({ page }) => {
    const requests: IterationListRequestQuery[] = []
    await mockIterationList(page, threeStateItems, {
      onRequest: (query) => requests.push(query),
    })

    await gotoWorkspace(page)
    await expect(historyStrip(page)).toBeVisible()

    // 近期条既有行为回归：默认参数（pageSize=20、无 status → completed-only、无 q）不变
    await expectRecentStripDefaultQuery(requests)
    // 等近期条条目就绪（loading→ready 重渲染完成后）再点击，避免点击落在被替换的节点上
    await expect(
      historyStrip(page).getByRole('button', { name: /open history item/i }),
    ).toBeVisible({ timeout: 15000 })

    // “查看全部”存在且可达完整 Iteration Memory（默认全状态）
    await expect(viewAllButton(page)).toBeEnabled()
    await viewAllButton(page).click()

    await expect(page).toHaveURL(/\/workspace\/iterations\?status=all/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: /iteration memory/i })).toBeVisible()
    await expect(statusFilter(page).getByRole('radio', { name: /^all/i })).toBeChecked()
    await expect(iterationItems(page)).toHaveCount(3)

    // 列表页请求以 status=all 调用（与近期条默认 completed-only 区分）
    await expect
      .poll(() => requests.some((query) => query.status === 'all'), { timeout: 15000 })
      .toBe(true)
  })

  test('TC-6.3 the left sidebar exposes an Iterations nav item that switches and highlights without breaking existing entries', async ({ page }) => {
    const requests: IterationListRequestQuery[] = []
    await mockIterationList(page, threeStateItems, {
      onRequest: (query) => requests.push(query),
    })

    await gotoWorkspace(page)

    // 既有导航项不回归：Generate 与 Style Memory（plan-04 改名，ADR-8）并列存在
    await expect(primaryNav(page).getByRole('link', { name: /^generate$/i })).toBeVisible()
    await expect(
      primaryNav(page).getByRole('link', { name: /^Style Memory$/i }),
    ).toBeVisible()

    // plan-06 契约：Iterations 导航项存在且可达列表页（URL 无参数 → 页面级默认 all）
    const navLink = iterationsNavLink(page)
    await expect(navLink).toBeVisible()
    await navLink.click()

    await expect(page).toHaveURL(/\/workspace\/iterations/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: /iteration memory/i })).toBeVisible()
    await expect(statusFilter(page).getByRole('radio', { name: /^all/i })).toBeChecked()
    await expect(requests.length, 'iteration list endpoint was queried').toBeGreaterThan(0)
    expect(requests[0].status, 'nav entry without params must default to all').toBe('all')

    // 高亮规则与现有项一致：命中 /workspace/iterations 时 Iterations 项 aria-current=page，Generate 不高亮
    await expect(iterationsNavLink(page)).toHaveAttribute('aria-current', 'page')
    await expect(primaryNav(page).getByRole('link', { name: /^generate$/i })).not.toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('TC-6.4 View all stays usable from an empty recent strip and reaches the full list', async ({ page }) => {
    // 近期条无任何完成结果（仅 processing / failed 记录）：入口仍可用
    await mockIterationList(page, [
      integrationItem({
        id: 'iter-int-processing',
        status: 'processing',
        promptSummary: 'Watercolor petals study',
      }),
      integrationItem({
        id: 'iter-int-failed',
        status: 'failed',
        promptSummary: 'Neon dusk retry attempt',
      }),
    ])

    await gotoWorkspace(page)
    await expect(historyStrip(page)).toBeVisible()
    // 等近期条空态渲染完成（loading→ready 重渲染后）再点击，避免点击落在被替换的节点上
    await expect(historyStrip(page).getByText(/renders will appear here/i)).toBeVisible({
      timeout: 15000,
    })
    await expect(viewAllButton(page)).toBeEnabled()

    await viewAllButton(page).click()

    await expect(page).toHaveURL(/\/workspace\/iterations\?status=all/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: /iteration memory/i })).toBeVisible()
    await expect(iterationItems(page, 'processing')).toHaveCount(1)
    await expect(iterationItems(page, 'failed')).toHaveCount(1)
  })
})
