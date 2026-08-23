import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockApiError,
  mockAuthSession,
  mockIterationDetail,
  mockIterationDetailSequence,
  mockIterationList,
  type MockIterationDetail,
  type MockIterationListItem,
} from './helpers/mock-api'

/**
 * plan-03 — Iteration Memory 迭代详情三态与轮询 E2E（red → green）
 *
 * 来源：docs/13-Iteration-Memory闭环补全/13-2-实现计划-Iteration-Memory闭环补全/plan-03-迭代详情三态与轮询.md
 * §5 E2E 验收：三态详情渲染（completed 并排 + 分区块 / processing 阶段与保留上下文、
 * 无生成入口 / failed 失败说明与保留上下文 + 动作占位）、processing 5s 轮询序列到
 * completed/failed 原地切换、详情 5xx 保留列表可重试/关闭、上一条/下一条切换与
 * 返回列表保位、旧记录缺失标记（recipeSource/variablesSource fallback|missing、
 * 来源图缺失占位）。
 *
 * 列表侧复用 plan-02 已稳定契约：[data-testid="iteration-list"] /
 * [data-testid="iteration-list-item"][data-status][data-selected]、
 * textbox "Search iterations…"、radiogroup "Status filter"、button "Load earlier…"。
 *
 * ---------------------------------------------------------------------------
 * 详情侧选择器契约（实现方需提供，red → green 对齐用）：
 * - [data-testid="iteration-detail-panel"] — 详情面板容器
 *   - data-status="completed|processing|failed"（三态变体，轮询原地切换断言）
 *   - data-iteration-id（当前展示条目 id，上一条/下一切换断言）
 * - [data-testid="iteration-detail-error"] — 详情 5xx/404 错误位
 *   （内含 Retry 与 Close 按钮；列表与视图状态不动）
 * - [data-testid="iteration-reference-image"] — 参考图容器（内含 img，src=sourceImageUrl）
 * - [data-testid="iteration-reference-missing"] — 来源图缺失占位（sourceImageUrl=null）
 * - [data-testid="iteration-result-image"] — 结果图容器（内含 img，src=resultFileUrl）
 * - [data-testid="iteration-context-evidence"] — 风格证据与不变量分区块
 *   （data-source=recipeSource：snapshot|fallback|missing；recipe facets 展示）
 * - [data-testid="iteration-context-prompt"] — 提示内容分区块（promptSnapshot 纯文本）
 * - [data-testid="iteration-context-variables"] — 变量与排除项分区块
 *   （data-source=variablesSource；含 variables + negativePromptSnapshot）
 * - [data-testid="iteration-context-settings"] — 生成设置分区块（params + modelName）
 * - [data-testid="iteration-failure-reason"] — 失败说明（errorMessage 映射业务文案）
 * - [data-testid="iteration-detail-actions"] — 底部动作区插槽占位
 *   （completed/failed 渲染空占位容器；processing 不渲染）
 * - 紧凑宽度使用 Back to list；桌面双栏使用 Close detail；Previous / Next 保留相邻浏览，
 *   位于列表边界时对应方向按钮 disabled
 * ---------------------------------------------------------------------------
 */

/** 既有 V2 recipe fixture（analysis-v2-completed.json.recipe）作为详情快照内容 */
const V2_RECIPE = (loadFixture('analysis-v2-completed.json') as { recipe: object }).recipe

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
}): MockIterationDetail {
  const { id, status, prompt } = overrides
  return {
    id,
    analysisTaskId: `analysis-${id}`,
    status,
    promptSnapshot: prompt,
    negativePromptSnapshot: 'watermark, distorted glass',
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
    sourceTemplateId: null,
    sourceTemplateName: null,
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
  createdAt?: string
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
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
  }
}

/** 最新在前；每条 promptSummary 都含 "Neon"，q=neon 时保留全集 */
function buildIterationArchive(count: number): MockIterationListItem[] {
  return Array.from({ length: count }, (_, index) => {
    const seq = String(index + 1).padStart(3, '0')
    const status: MockIterationListItem['status'] =
      index === 2 ? 'processing' : index === 5 ? 'failed' : 'completed'
    return iterationItem({
      id: `iter-${seq}`,
      status,
      promptSummary: `Neon archive study ${seq}`,
      createdAt: new Date(Date.UTC(2024, 0, 1 + index)).toISOString(),
    })
  })
}

function iterationItems(page: Page, status?: MockIterationListItem['status']) {
  return status
    ? page.locator(`[data-testid="iteration-list-item"][data-status="${status}"]`)
    : page.getByTestId('iteration-list-item')
}

function detailPanel(page: Page) {
  return page.getByTestId('iteration-detail-panel')
}

function detailBlock(page: Page, block: 'evidence' | 'prompt' | 'variables' | 'settings') {
  return page.getByTestId(`iteration-context-${block}`)
}

function backToListButton(page: Page) {
  return detailPanel(page).getByRole('button', {
    name: /back to list|return to list|back to iterations/i,
  })
}

function closeDetailButton(page: Page) {
  return detailPanel(page).getByRole('button', { name: /close detail/i })
}

function previousButton(page: Page) {
  return detailPanel(page).getByRole('button', { name: /previous|older/i })
}

function nextButton(page: Page) {
  return detailPanel(page).getByRole('button', { name: /next|newer/i })
}

function searchInput(page: Page) {
  return page.getByRole('textbox', { name: /search iteration/i })
}

function statusFilter(page: Page) {
  return page.getByRole('radiogroup', { name: /status filter|filter by status/i })
}

function loadEarlierButton(page: Page) {
  return page.getByRole('button', { name: /load earlier|browse earlier|earlier records/i })
}

async function mockCdnImages(page: Page) {
  await page.route('https://cdn.example.com/**', async (route) => {
    if (
      route.request().resourceType() === 'image' ||
      /\.(png|jpg|jpeg|webp)$/.test(route.request().url())
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        ),
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

test.describe('plan-03 Iteration Memory detail three states and polling', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockCdnImages(page)
  })

  test('TC-3.1 completed detail shows reference and result side by side with full context blocks', async ({ page }) => {
    const prompt = 'Precise neon cityscape at dusk with amber glass towers'
    await mockIterationList(page, [
      iterationItem({ id: 'iter-completed', status: 'completed', promptSummary: 'Neon cityscape at dusk' }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({ id: 'iter-completed', status: 'completed', prompt }),
    )

    await openIterations(page)
    await iterationItems(page).filter({ hasText: 'Neon cityscape at dusk' }).click()

    const panel = detailPanel(page)
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('data-status', 'completed')
    await expect(panel).toHaveAttribute('data-iteration-id', 'iter-completed')
    await expect(backToListButton(page)).toBeHidden()
    await expect(closeDetailButton(page)).toBeVisible()
    await expect(previousButton(page)).toBeVisible()
    await expect(nextButton(page)).toBeVisible()

    // 左区第一视觉焦点：参考图与生成结果并排
    await expect(page.getByTestId('iteration-reference-image').locator('img')).toHaveAttribute(
      'src',
      /references\/iter-completed\/original\.png/,
    )
    await expect(page.getByTestId('iteration-result-image').locator('img')).toHaveAttribute(
      'src',
      /generated\/iter-completed\/result\.webp/,
    )

    // 右区"当时的创作上下文"分区块
    const evidence = detailBlock(page, 'evidence')
    await expect(evidence).toHaveAttribute('data-source', 'snapshot')
    await expect(evidence).toContainText('warm amber and sand palette')
    await expect(evidence).toContainText(/lighting/i)

    await expect(detailBlock(page, 'prompt')).toContainText(prompt)

    const variables = detailBlock(page, 'variables')
    await expect(variables).toHaveAttribute('data-source', 'snapshot')
    await expect(variables).toContainText('amber bottle')
    await expect(variables).toContainText('watermark, distorted glass')

    const settings = detailBlock(page, 'settings')
    await expect(settings).toContainText('16:9')
    await expect(settings).toContainText(/\bhd\b/i)
    await expect(settings).toContainText('black-forest-2.5')

    // 底部动作区插槽占位（plan-04/plan-05 填充）
    await expect(page.getByTestId('iteration-detail-actions')).toBeVisible()
  })

  test('TC-3.2 processing detail shows stage and preserved context without generate or resubmit entries', async ({ page }) => {
    await mockIterationList(page, [
      iterationItem({ id: 'iter-processing', status: 'processing', promptSummary: 'Watercolor petals study' }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({
        id: 'iter-processing',
        status: 'processing',
        prompt: 'Watercolor petals study with soft window light',
      }),
    )

    await openIterations(page)
    await iterationItems(page).filter({ hasText: 'Watercolor petals study' }).click()

    const panel = detailPanel(page)
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('data-status', 'processing')
    await expect(panel).toContainText(/generation in progress|generating|processing/i)
    await expect(panel).toContainText(
      /safe to leave|can leave|leave this page|leave the page/i,
    )

    // 已保留上下文：参考图、提示、变量与排除项、设置
    await expect(page.getByTestId('iteration-reference-image').locator('img')).toBeVisible()
    await expect(detailBlock(page, 'prompt')).toContainText(
      'Watercolor petals study with soft window light',
    )
    await expect(detailBlock(page, 'variables')).toBeVisible()
    await expect(detailBlock(page, 'settings')).toBeVisible()

    // 无结果图、无动作区、无生成/重复提交入口
    await expect(page.getByTestId('iteration-result-image')).toHaveCount(0)
    await expect(page.getByTestId('iteration-detail-actions')).toHaveCount(0)
    await expect(
      panel.getByRole('button', { name: /generate|regenerate|resubmit|submit again|re-?run/i }),
    ).toHaveCount(0)
  })

  test('TC-3.3 processing detail polls the sequence and switches in place to completed', async ({ page }) => {
    test.setTimeout(45000)
    const base = { id: 'iter-poll', prompt: 'Polling study that completes while open' }
    await mockIterationList(page, [
      iterationItem({ id: 'iter-poll', status: 'processing', promptSummary: 'Polling study that completes' }),
    ])
    let detailRequests = 0
    await mockIterationDetailSequence(
      page,
      'iter-poll',
      [
        iterationDetail({ ...base, status: 'processing' }),
        iterationDetail({ ...base, status: 'processing' }),
        iterationDetail({ ...base, status: 'completed' }),
      ],
      { onRequest: () => detailRequests++ },
    )

    await openIterations(page)
    await iterationItems(page).filter({ hasText: 'Polling study that completes' }).click()

    await expect(detailPanel(page)).toHaveAttribute('data-status', 'processing')

    // 同一面板容器原地切换为 completed（不要求重新打开）
    await expect(detailPanel(page)).toHaveAttribute('data-status', 'completed', {
      timeout: 25000,
    })
    await expect(detailPanel(page)).toHaveAttribute('data-iteration-id', 'iter-poll')
    await expect(page.getByTestId('iteration-result-image').locator('img')).toBeVisible()

    expect(
      detailRequests,
      'detail endpoint was polled beyond the initial fetch (5s cadence sequence)',
    ).toBeGreaterThanOrEqual(3)
  })

  test('TC-3.4 processing detail polling can switch in place to failed', async ({ page }) => {
    test.setTimeout(45000)
    const base = { id: 'iter-poll-fail', prompt: 'Polling study that fails while open' }
    await mockIterationList(page, [
      iterationItem({ id: 'iter-poll-fail', status: 'processing', promptSummary: 'Polling study that fails' }),
    ])
    await mockIterationDetailSequence(page, 'iter-poll-fail', [
      iterationDetail({ ...base, status: 'processing' }),
      iterationDetail({
        ...base,
        status: 'failed',
        errorMessage: 'Provider timeout while rendering',
      }),
    ])

    await openIterations(page)
    await iterationItems(page).filter({ hasText: 'Polling study that fails' }).click()

    await expect(detailPanel(page)).toHaveAttribute('data-status', 'processing')
    await expect(detailPanel(page)).toHaveAttribute('data-status', 'failed', {
      timeout: 25000,
    })
    await expect(page.getByTestId('iteration-failure-reason')).toBeVisible()
    await expect(page.getByTestId('iteration-failure-reason')).toContainText(
      /provider timeout|failed|error|unavailable/i,
    )
  })

  test('TC-3.5 failed detail keeps the preserved context and reserves the actions slot', async ({ page }) => {
    await mockIterationList(page, [
      iterationItem({ id: 'iter-failed', status: 'failed', promptSummary: 'Neon cityscape retry attempt' }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({
        id: 'iter-failed',
        status: 'failed',
        prompt: 'Neon cityscape retry attempt with corrected framing',
        errorMessage: 'Provider rejected the request after retries',
      }),
    )

    await openIterations(page)
    await iterationItems(page).filter({ hasText: 'Neon cityscape retry attempt' }).click()

    const panel = detailPanel(page)
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('data-status', 'failed')
    await expect(page.getByTestId('iteration-failure-reason')).toContainText(
      /provider rejected|failed|error/i,
    )

    // 保留的参考图/提示/变量/排除项/设置
    await expect(page.getByTestId('iteration-reference-image').locator('img')).toBeVisible()
    await expect(detailBlock(page, 'prompt')).toContainText(
      'Neon cityscape retry attempt with corrected framing',
    )
    await expect(detailBlock(page, 'variables')).toContainText('watermark, distorted glass')
    await expect(detailBlock(page, 'settings')).toContainText('black-forest-2.5')
    await expect(page.getByTestId('iteration-result-image')).toHaveCount(0)

    // 底部动作区为"修正并继续"预留插槽占位（行为由 plan-04 验收）
    await expect(page.getByTestId('iteration-detail-actions')).toBeVisible()
  })

  test('TC-3.6 detail 5xx keeps the list untouched and offers retry and close', async ({ page }) => {
    await mockIterationList(page, [
      iterationItem({ id: 'iter-completed', status: 'completed', promptSummary: 'Neon cityscape at dusk' }),
      iterationItem({ id: 'iter-processing', status: 'processing', promptSummary: 'Watercolor petals study' }),
      iterationItem({ id: 'iter-failed', status: 'failed', promptSummary: 'Neon cityscape retry attempt' }),
    ])
    await mockApiError(page, '**/api/generation/iter-completed**', 500, {
      error: 'Iteration detail temporarily unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await openIterations(page)
    await searchInput(page).fill('neon')
    await expect(iterationItems(page)).toHaveCount(2)

    await iterationItems(page).filter({ hasText: 'Neon cityscape at dusk' }).click()

    const errorFace = page.getByTestId('iteration-detail-error')
    await expect(errorFace).toBeVisible()
    await expect(errorFace).toContainText(/detail|load|open/i)
    await expect(errorFace.getByRole('button', { name: /retry|try again/i })).toBeVisible()
    await expect(errorFace.getByRole('button', { name: /close|dismiss/i })).toBeVisible()

    // 列表与视图状态不动
    await expect(searchInput(page)).toHaveValue('neon')
    await expect(iterationItems(page)).toHaveCount(2)

    // 重试恢复
    await page.unroute('**/api/generation/iter-completed**')
    await mockIterationDetail(
      page,
      iterationDetail({
        id: 'iter-completed',
        status: 'completed',
        prompt: 'Precise neon cityscape at dusk with amber glass towers',
      }),
    )
    await errorFace.getByRole('button', { name: /retry|try again/i }).click()

    await expect(detailPanel(page)).toHaveAttribute('data-status', 'completed')
    await expect(iterationItems(page)).toHaveCount(2)
  })

  test('TC-3.7 previous and next walk the list order and keep the row highlight in sync', async ({ page }) => {
    await mockIterationList(page, [
      iterationItem({
        id: 'iter-newest',
        status: 'completed',
        promptSummary: 'Neon skyline at dusk',
        createdAt: '2024-03-03T09:00:00.000Z',
      }),
      iterationItem({
        id: 'iter-mid',
        status: 'processing',
        promptSummary: 'Watercolor petals study',
        createdAt: '2024-03-02T09:00:00.000Z',
      }),
      iterationItem({
        id: 'iter-old',
        status: 'failed',
        promptSummary: 'Neon skyline retry attempt',
        createdAt: '2024-03-01T09:00:00.000Z',
      }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({ id: 'iter-newest', status: 'completed', prompt: 'Prompt of the newest neon skyline' }),
    )
    await mockIterationDetail(
      page,
      iterationDetail({ id: 'iter-mid', status: 'processing', prompt: 'Prompt of the mid watercolor study' }),
    )
    await mockIterationDetail(
      page,
      iterationDetail({ id: 'iter-old', status: 'failed', prompt: 'Prompt of the old failed retry' }),
    )

    await openIterations(page)
    await iterationItems(page).filter({ hasText: 'Neon skyline at dusk' }).click()

    await expect(detailPanel(page)).toHaveAttribute('data-iteration-id', 'iter-newest')
    await expect(previousButton(page)).toBeDisabled()

    await nextButton(page).click()
    await expect(detailPanel(page)).toHaveAttribute('data-iteration-id', 'iter-mid')
    await expect(detailPanel(page)).toHaveAttribute('data-status', 'processing')
    // 列表选中高亮同步：恰好一条 data-selected
    await expect(page.locator('[data-testid="iteration-list-item"][data-selected]')).toHaveCount(1)
    await expect(
      page
        .locator('[data-testid="iteration-list-item"][data-selected]')
        .filter({ hasText: 'Watercolor petals study' }),
    ).toHaveCount(1)

    await nextButton(page).click()
    await expect(detailPanel(page)).toHaveAttribute('data-iteration-id', 'iter-old')
    await expect(nextButton(page)).toBeDisabled()

    await previousButton(page).click()
    await expect(detailPanel(page)).toHaveAttribute('data-iteration-id', 'iter-mid')

    await previousButton(page).click()
    await expect(detailPanel(page)).toHaveAttribute('data-iteration-id', 'iter-newest')
    await expect(previousButton(page)).toBeDisabled()
  })

  test('TC-3.8 opening and closing the detail never resets search, filter, depth, or scroll', async ({ page }) => {
    const archive = buildIterationArchive(26)
    await mockIterationList(page, archive)
    await mockIterationDetail(
      page,
      iterationDetail({ id: 'iter-010', status: 'completed', prompt: 'Prompt of archive study 010' }),
    )

    await openIterations(page)
    await searchInput(page).fill('neon')
    await statusFilter(page).getByRole('radio', { name: /^completed/i }).check()

    const completedCount = archive.filter((item) => item.status === 'completed').length
    await expect(iterationItems(page)).toHaveCount(20)
    await loadEarlierButton(page).click()
    await expect(iterationItems(page)).toHaveCount(completedCount)

    const list = page.getByTestId('iteration-list')
    await list.evaluate((el) => {
      el.scrollTop = 600
    })
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(600)

    await iterationItems(page).filter({ hasText: 'Neon archive study 010' }).click()
    await expect(detailPanel(page)).toBeVisible()

    await closeDetailButton(page).click()
    await expect(detailPanel(page)).toBeHidden()

    // 列表搜索、筛选、已加载深度、滚动位置全部保持
    await expect(searchInput(page)).toHaveValue('neon')
    await expect(statusFilter(page).getByRole('radio', { name: /^completed/i })).toBeChecked()
    await expect(iterationItems(page)).toHaveCount(completedCount)
    await expect
      .poll(() => list.evaluate((el) => el.scrollTop), { timeout: 15000 })
      .toBeGreaterThan(400)
  })

  test('TC-3.9 legacy record missing sources are marked without blocking the rest of the detail', async ({ page }) => {
    await mockIterationList(page, [
      iterationItem({ id: 'iter-legacy', status: 'completed', promptSummary: 'Legacy neon study without snapshots' }),
    ])
    await mockIterationDetail(page, {
      ...iterationDetail({
        id: 'iter-legacy',
        status: 'completed',
        prompt: 'Legacy neon study without snapshots',
      }),
      // 旧记录：recipe 活引用回退、variables 缺失、来源图资产缺失
      recipeSource: 'fallback',
      variables: [],
      variablesSource: 'missing',
      sourceImageUrl: null,
      sourceAssetId: null,
    })

    await openIterations(page)
    await iterationItems(page).filter({ hasText: 'Legacy neon study' }).click()

    const panel = detailPanel(page)
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('data-status', 'completed')

    // 回退标记 + 内容仍可读
    const evidence = detailBlock(page, 'evidence')
    await expect(evidence).toHaveAttribute('data-source', 'fallback')
    await expect(evidence).toContainText('warm amber and sand palette')
    await expect(evidence).toContainText(/fallback|回退|reconstructed|earlier record/i)

    // 缺失标记
    const variables = detailBlock(page, 'variables')
    await expect(variables).toHaveAttribute('data-source', 'missing')
    await expect(variables).toContainText(/missing|unavailable|缺失/i)

    // 来源图缺失显示占位说明而非裂图
    await expect(page.getByTestId('iteration-reference-missing')).toBeVisible()
    await expect(page.getByTestId('iteration-reference-image')).toHaveCount(0)

    // 其余内容不阻断
    await expect(page.getByTestId('iteration-result-image').locator('img')).toBeVisible()
    await expect(detailBlock(page, 'prompt')).toContainText('Legacy neon study without snapshots')
    await expect(detailBlock(page, 'settings')).toContainText('black-forest-2.5')
  })

  test('TC-3.10 compact widths replace the list with an accessible full-width detail', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await mockIterationList(page, [
      iterationItem({
        id: 'iter-compact',
        status: 'completed',
        promptSummary: 'Compact amber glass study',
      }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({
        id: 'iter-compact',
        status: 'completed',
        prompt: 'Compact amber glass study with soft window light',
      }),
    )

    await openIterations(page)
    await iterationItems(page).click()

    await expect(detailPanel(page)).toBeVisible()
    await expect(page.getByTestId('iteration-list')).toBeHidden()
    await expect(page.getByTestId('iteration-reference-image')).toBeVisible()

    await backToListButton(page).click()
    await expect(page.getByTestId('iteration-list')).toBeVisible()
    await expect(detailPanel(page)).toHaveCount(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await iterationItems(page).click()
    await expect(detailPanel(page)).toBeVisible()
    await expect(page.getByTestId('iteration-detail-actions')).toBeVisible()
  })
})
