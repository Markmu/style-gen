import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAuthSession,
  mockIterationDetail,
  mockIterationDetailSequence,
  mockIterationList,
  mockTemplateCollection,
  mockTemplateCreateCapture,
  type MockIterationDetail,
  type MockIterationListItem,
  type MockTemplateMemoryRecord,
} from './helpers/mock-api'

/**
 * plan-05 — 保存为 Style Memory 与已保存态 E2E（red → green）
 *
 * 来源：docs/13-Iteration-Memory闭环补全/13-2-实现计划-Iteration-Memory闭环补全/plan-05-保存为StyleMemory与已保存态.md
 * §5 E2E 验收 + 架构 §6.4（保存链路与防御性口径）、ADR-5（templates 反向关联）、
 * §7.3（POST /api/templates 契约：新增可选 sourceGenerationTaskId）、§5.2
 * 已保存状态（savedTemplate 决定"已保存 + 打开"）。
 *
 * 场景：保存入口条件（completed 且有真实结果且 sourceAssetId 非空且未保存；
 * processing/failed/无结果不出现入口；sourceAssetId 缺失显示来源缺失说明）、
 * 保存对话框预填（content=promptSnapshot、variables=detail.variables、名称必填
 * 空名禁止提交）、提交 POST /api/templates 携带 { name, content, variables,
 * sourceAssetId, sourceGenerationTaskId }、保存成功后详情切换已保存态（不重拉
 * 整页）、重复进入不显示保存按钮、"打开"跳转 /workspace/templates 并按 focus
 * 定位高亮、409 同名冲突沿用既有错误呈现且对话框保留已填内容。
 *
 * ---------------------------------------------------------------------------
 * 详情侧复用 plan-03/04 已交付契约：[data-testid="iteration-detail-panel"]
 * （data-status / data-iteration-id）、[data-testid="iteration-detail-actions"]、
 * [data-testid="iteration-list-item"][data-status][data-selected]、
 * textbox "Search iterations…"。
 *
 * plan-05 需提供的选择器契约（red → green 对齐用）：
 * - 保存入口：[data-testid="iteration-detail-actions"] 内按钮
 *   “Save as Style Memory”（/save (as )?style ?memory/i）——仅在
 *   status === 'completed' && resultFileUrl 非空 && sourceAssetId 非空 &&
 *   savedTemplate == null 时渲染
 * - 已保存态：[data-testid="iteration-saved-state"]，内含可读的已保存说明
 *   （/saved (as )?style ?memory/i 与 savedTemplate.name）与 “打开”按钮
 *   （/open|view/i → router.push('/workspace/templates?focus=<id>')）；
 *   已保存态不出现保存按钮
 * - 来源缺失说明：[data-testid="iteration-save-unavailable"]（sourceAssetId
 *   为 null 的 completed 详情渲染，含来源缺失/无法保存语义文案），不出现保存入口
 * - 保存对话框：[data-testid="save-style-memory-dialog"]（role=dialog），
 *   含可访问命名的名称输入（/name/i，初始为空、必填）与内容输入
 *   （/content|prompt/i，预填 promptSnapshot），变量默认值可见（detail.variables）；
 *   提交按钮（dialog 内 /^save/i）在名称为空时 disabled（禁止提交、零 POST）
 * - Style Memory 页定位：[data-testid="style-memory-card"] 在 focus=<id> 命中时
 *   追加 data-focused="true" 并滚动进入视口；参数消费后从 URL 清除（replace）
 * ---------------------------------------------------------------------------
 */

/** 既有 V2 recipe fixture（analysis-v2-completed.json.recipe）作为详情快照内容 */
const V2_RECIPE = (loadFixture('analysis-v2-completed.json') as { recipe: object }).recipe

/** 目标迭代（保存源）的提示 — 保持独特，作为预填/提交体断言锚点 */
const TARGET_PROMPT = 'Neon dusk hero study with amber glass towers'
const TARGET_NEGATIVE = 'watermark, distorted glass'

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
  resultFileUrl?: string | null
  sourceAssetId?: string | null
  savedTemplate?: { id: string; name: string } | null
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
      overrides.resultFileUrl !== undefined
        ? overrides.resultFileUrl
        : status === 'completed'
          ? `https://cdn.example.com/generated/${id}/result.webp`
          : null,
    errorMessage:
      status === 'failed' ? overrides.errorMessage ?? 'Provider timeout while rendering' : null,
    recipe: V2_RECIPE,
    recipeSource: 'snapshot',
    variables: ITERATION_VARIABLES,
    variablesSource: 'snapshot',
    sourceImageUrl: `https://cdn.example.com/references/${id}/original.png`,
    sourceAssetId: overrides.sourceAssetId !== undefined ? overrides.sourceAssetId : `asset-${id}`,
    sourceTemplateId: null,
    sourceTemplateName: null,
    savedTemplate: overrides.savedTemplate !== undefined ? overrides.savedTemplate : null,
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
      await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
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

/** 详情动作区（plan-03 契约容器；plan-05 填充 secondaryActions 保存入口） */
function detailActions(page: Page) {
  return page.getByTestId('iteration-detail-actions')
}

/** plan-05 契约：保存入口按钮（secondaryActions 插槽） */
function saveStyleMemoryButton(page: Page) {
  return detailActions(page).getByRole('button', { name: /save (as )?style ?memory/i })
}

/** plan-05 契约：已保存态（说明 + 打开按钮，无保存按钮） */
function savedState(page: Page) {
  return page.getByTestId('iteration-saved-state')
}

function openSavedMemoryButton(page: Page) {
  return savedState(page).getByRole('button', { name: /open|view/i })
}

/** plan-05 契约：来源缺失说明（sourceAssetId null 的 completed 详情） */
function saveUnavailableNote(page: Page) {
  return page.getByTestId('iteration-save-unavailable')
}

/** plan-05 契约：保存对话框 */
function saveDialog(page: Page) {
  return page.getByTestId('save-style-memory-dialog')
}

function dialogNameInput(page: Page) {
  return saveDialog(page).getByRole('textbox', { name: /name/i })
}

function dialogContentInput(page: Page) {
  return saveDialog(page).getByRole('textbox', { name: /content|prompt/i })
}

function dialogSubmitButton(page: Page) {
  return saveDialog(page).getByRole('button', { name: /^save/i })
}

function searchInput(page: Page) {
  return page.getByRole('textbox', { name: /search iteration/i })
}

async function openDetail(page: Page, summary: string) {
  await iterationItems(page).filter({ hasText: summary }).click()
  await expect(detailPanel(page)).toBeVisible()
}

/** 保存成功后的已保存态断言（说明 + 模板名 + 打开入口，无保存按钮） */
async function expectSavedState(page: Page, templateName: string) {
  await expect(savedState(page)).toBeVisible()
  await expect(savedState(page)).toContainText(/saved (as )?style ?memory/i)
  await expect(savedState(page)).toContainText(templateName)
  await expect(openSavedMemoryButton(page)).toBeVisible()
  await expect(saveStyleMemoryButton(page)).toHaveCount(0)
}

test.describe('plan-05 save iteration as Style Memory and saved state', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockCdnImages(page)
  })

  test('TC-5.1 completed detail with a real result shows the Save as Style Memory entry', async ({ page }) => {
    await mockIterationList(page, [
      iterationItem({ id: 'iter-save-source', status: 'completed', promptSummary: 'Neon dusk hero study' }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({ id: 'iter-save-source', status: 'completed', prompt: TARGET_PROMPT }),
    )

    await openIterations(page)
    await openDetail(page, 'Neon dusk hero study')

    // 入口条件成立：completed + resultFileUrl 非空 + sourceAssetId 非空 + 未保存
    await expect(detailPanel(page)).toHaveAttribute('data-status', 'completed')
    await expect(saveStyleMemoryButton(page)).toBeVisible()
    // 未保存：不出现已保存态与来源缺失说明
    await expect(savedState(page)).toHaveCount(0)
    await expect(saveUnavailableNote(page)).toHaveCount(0)
  })

  test('TC-5.2 processing, failed, and result-less completed details expose no save entry', async ({ page }) => {
    await mockIterationList(page, [
      iterationItem({ id: 'iter-processing', status: 'processing', promptSummary: 'Watercolor petals study' }),
      iterationItem({ id: 'iter-failed', status: 'failed', promptSummary: 'Neon dusk retry attempt' }),
      iterationItem({ id: 'iter-no-result', status: 'completed', promptSummary: 'Neon dusk no result record' }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({ id: 'iter-processing', status: 'processing', prompt: 'Watercolor petals study with soft window light' }),
    )
    await mockIterationDetail(
      page,
      iterationDetail({
        id: 'iter-failed',
        status: 'failed',
        prompt: 'Neon dusk retry with corrected framing',
        errorMessage: 'Provider timeout while rendering',
      }),
    )
    await mockIterationDetail(
      page,
      // completed 但无真实结果（resultFileUrl null）→ 不出现任何保存入口
      iterationDetail({
        id: 'iter-no-result',
        status: 'completed',
        prompt: 'Neon dusk study without a real result asset',
        resultFileUrl: null,
      }),
    )

    await openIterations(page)

    // processing：动作区整体不渲染（plan-03 既有行为），更无保存入口
    await openDetail(page, 'Watercolor petals study')
    await expect(detailPanel(page)).toHaveAttribute('data-status', 'processing')
    await expect(detailActions(page)).toHaveCount(0)
    await expect(saveStyleMemoryButton(page)).toHaveCount(0)

    // failed：动作区存在（plan-04"修正并继续"），但不出现保存入口
    await iterationItems(page).filter({ hasText: 'Neon dusk retry attempt' }).click()
    await expect(detailPanel(page)).toHaveAttribute('data-status', 'failed')
    await expect(detailActions(page)).toBeVisible()
    await expect(saveStyleMemoryButton(page)).toHaveCount(0)

    // completed 无真实结果：动作区存在但不出现保存入口，也无来源缺失说明（来源资产存在）
    await iterationItems(page).filter({ hasText: 'Neon dusk no result record' }).click()
    await expect(detailPanel(page)).toHaveAttribute('data-status', 'completed')
    await expect(detailActions(page)).toBeVisible()
    await expect(saveStyleMemoryButton(page)).toHaveCount(0)
    await expect(saveUnavailableNote(page)).toHaveCount(0)
  })

  test('TC-5.3 a completed detail without a source asset shows the source-missing note instead of the save entry', async ({ page }) => {
    await mockIterationList(page, [
      iterationItem({ id: 'iter-legacy-no-asset', status: 'completed', promptSummary: 'Neon dusk legacy record' }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({
        id: 'iter-legacy-no-asset',
        status: 'completed',
        prompt: 'Legacy neon dusk study without a source asset',
        sourceAssetId: null,
      }),
    )

    await openIterations(page)
    await openDetail(page, 'Neon dusk legacy record')

    // 防御性口径（架构 §6.4）：来源缺失 → 说明 + 禁用保存入口，其余详情不阻断
    await expect(saveUnavailableNote(page)).toBeVisible()
    await expect(saveUnavailableNote(page)).toContainText(/missing|unavailable|cannot|unable/i)
    await expect(saveStyleMemoryButton(page)).toHaveCount(0)
    await expect(savedState(page)).toHaveCount(0)
    await expect(page.getByTestId('iteration-result-image').locator('img')).toBeVisible()
  })

  test('TC-5.4 an already-saved iteration shows the saved state with Open and no save button', async ({ page }) => {
    await mockIterationList(page, [
      iterationItem({ id: 'iter-already-saved', status: 'completed', promptSummary: 'Neon dusk saved study' }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({
        id: 'iter-already-saved',
        status: 'completed',
        prompt: TARGET_PROMPT,
        savedTemplate: { id: 'tpl-saved-123', name: 'Neon Dusk Memory' },
      }),
    )

    await openIterations(page)
    await openDetail(page, 'Neon dusk saved study')

    // savedTemplate 非空 → 已保存态 + 打开入口，无保存按钮（避免重复资产）
    await expectSavedState(page, 'Neon Dusk Memory')
    await expect(saveUnavailableNote(page)).toHaveCount(0)
  })

  test('TC-5.5 the save dialog prefills content and variables and blocks submission while the name is empty', async ({ page }) => {
    const capture = await mockTemplateCreateCapture(page)
    await mockIterationList(page, [
      iterationItem({ id: 'iter-save-source', status: 'completed', promptSummary: 'Neon dusk hero study' }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({ id: 'iter-save-source', status: 'completed', prompt: TARGET_PROMPT }),
    )

    await openIterations(page)
    await openDetail(page, 'Neon dusk hero study')
    await saveStyleMemoryButton(page).click()

    // 对话框打开：名称必填为空、内容预填 promptSnapshot、变量默认值可见
    const dialog = saveDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('role', 'dialog')
    await expect(dialogNameInput(page)).toBeVisible()
    await expect(dialogNameInput(page)).toHaveValue('')
    await expect(dialogContentInput(page)).toHaveValue(TARGET_PROMPT)
    await expect(dialog).toContainText('amber bottle')
    await expect(dialog).toContainText('quiet studio table')

    // 名称必填：空名禁止提交（disabled）且未发出任何保存请求
    await expect(dialogSubmitButton(page)).toBeDisabled()
    expect(capture.requests, 'empty name must not issue a template create request').toHaveLength(0)

    // 填入名称后可提交
    await dialogNameInput(page).fill('Neon Dusk Memory')
    await expect(dialogSubmitButton(page)).toBeEnabled()
    expect(capture.requests).toHaveLength(0)
  })

  test('TC-5.6 submitting the dialog posts the prefilled payload and switches the detail to the saved state in place', async ({ page }) => {
    const templateId = 'tpl-from-iter-save'
    const templateName = 'Neon Dusk Memory'
    const capture = await mockTemplateCreateCapture(page, [
      {
        status: 201,
        body: {
          id: templateId,
          name: templateName,
          content: TARGET_PROMPT,
          variables: ITERATION_VARIABLES,
          sourceAssetId: 'asset-iter-save-source',
          sourceImageUrl: 'https://cdn.example.com/references/iter-save-source/original.png',
          createdAt: '2024-03-03T09:01:00.000Z',
          updatedAt: '2024-03-03T09:01:00.000Z',
        },
      },
    ])
    // 详情序列：首次打开未保存；保存成功后无论实现方回调直用 POST 响应还是
    // 局部重拉详情（GET /api/generation/[id]），都得到同一份已保存态
    await mockIterationDetailSequence(page, 'iter-save-source', [
      iterationDetail({ id: 'iter-save-source', status: 'completed', prompt: TARGET_PROMPT }),
      iterationDetail({
        id: 'iter-save-source',
        status: 'completed',
        prompt: TARGET_PROMPT,
        savedTemplate: { id: templateId, name: templateName },
      }),
    ])
    await mockIterationList(page, [
      iterationItem({ id: 'iter-save-source', status: 'completed', promptSummary: 'Neon dusk hero study' }),
      iterationItem({ id: 'iter-other', status: 'completed', promptSummary: 'Neon skyline at dusk' }),
    ])

    await openIterations(page)
    // 预置列表检索态：保存成功后的"局部刷新"以列表状态保持为观察锚点
    await searchInput(page).fill('neon')
    await expect(iterationItems(page)).toHaveCount(2)
    await openDetail(page, 'Neon dusk hero study')

    await saveStyleMemoryButton(page).click()
    await dialogNameInput(page).fill(templateName)
    await dialogSubmitButton(page).click()

    // 恰好一次 POST /api/templates，提交体携带该次迭代的来源与快照
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(1)
    const body = capture.requests[0].body
    expect(body.name).toBe(templateName)
    expect(body.content).toBe(TARGET_PROMPT)
    expect(body.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'subject', defaultValue: 'amber bottle' }),
        expect.objectContaining({ name: 'environment', defaultValue: 'quiet studio table' }),
      ]),
    )
    expect(body.sourceAssetId).toBe('asset-iter-save-source')
    expect(body.sourceGenerationTaskId).toBe('iter-save-source')

    // 成功后：对话框关闭，详情切换已保存态（含打开入口，无保存按钮）
    await expect(saveDialog(page)).toHaveCount(0)
    await expectSavedState(page, templateName)

    // 局部刷新：列表检索/条目/选中与详情条目保持，不整页重拉、不导航
    await expect(searchInput(page)).toHaveValue('neon')
    await expect(iterationItems(page)).toHaveCount(2)
    await expect(page).toHaveURL(/\/workspace\/iterations/)
    await expect(detailPanel(page)).toHaveAttribute('data-iteration-id', 'iter-save-source')
  })

  test('TC-5.7 re-entering the saved iteration shows no save button and issues no new save request', async ({ page }) => {
    const templateName = 'Neon Dusk Memory'
    const capture = await mockTemplateCreateCapture(page, [
      {
        status: 201,
        body: {
          id: 'tpl-from-iter-save',
          name: templateName,
          content: TARGET_PROMPT,
          variables: ITERATION_VARIABLES,
          sourceAssetId: 'asset-iter-save-source',
          sourceImageUrl: 'https://cdn.example.com/references/iter-save-source/original.png',
          createdAt: '2024-03-03T09:01:00.000Z',
          updatedAt: '2024-03-03T09:01:00.000Z',
        },
      },
    ])
    await mockIterationDetailSequence(page, 'iter-save-source', [
      iterationDetail({ id: 'iter-save-source', status: 'completed', prompt: TARGET_PROMPT }),
      iterationDetail({
        id: 'iter-save-source',
        status: 'completed',
        prompt: TARGET_PROMPT,
        savedTemplate: { id: 'tpl-from-iter-save', name: templateName },
      }),
    ])
    await mockIterationList(page, [
      iterationItem({ id: 'iter-save-source', status: 'completed', promptSummary: 'Neon dusk hero study' }),
    ])

    // 第一轮：保存成功 → 详情切换已保存态
    await openIterations(page)
    await openDetail(page, 'Neon dusk hero study')
    await saveStyleMemoryButton(page).click()
    await dialogNameInput(page).fill(templateName)
    await dialogSubmitButton(page).click()
    await expectSavedState(page, templateName)

    // 关闭详情回到列表，再次进入同一条详情
    await detailPanel(page).getByRole('button', { name: /close detail/i }).click()
    await expect(detailPanel(page)).toBeHidden()
    await openDetail(page, 'Neon dusk hero study')

    // 重复进入：不显示保存按钮（不重复制造资产），仍为已保存态
    await expectSavedState(page, templateName)
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(1)
  })

  test('TC-5.8 Open navigates to Style Memory and focuses the saved card', async ({ page }) => {
    const savedTemplate = { id: 'tpl-focus-target', name: 'Neon Dusk Memory' }
    await mockIterationList(page, [
      iterationItem({ id: 'iter-already-saved', status: 'completed', promptSummary: 'Neon dusk saved study' }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({
        id: 'iter-already-saved',
        status: 'completed',
        prompt: TARGET_PROMPT,
        savedTemplate,
      }),
    )
    // 9 条记忆（3 行网格）：目标条目置于末行，定位必须滚动才能进入视口
    const otherMemories: MockTemplateMemoryRecord[] = Array.from({ length: 8 }, (_, index) => ({
      id: `tpl-memory-${index + 1}`,
      name: `Archive Memory ${index + 1}`,
      content: `Create {{subject}} with archive direction ${index + 1}.`,
      variables: [
        { name: 'subject', label: 'Subject', defaultValue: `archive subject ${index + 1}` },
      ],
      sourceAssetId: `tpl-memory-${index + 1}-asset`,
      sourceImageUrl: `https://cdn.example.com/references/tpl-memory-${index + 1}/original.png`,
      createdAt: '2024-03-01T09:00:00.000Z',
      updatedAt: '2024-03-01T09:00:00.000Z',
    }))
    await mockTemplateCollection(page, [
      ...otherMemories,
      {
        id: savedTemplate.id,
        name: savedTemplate.name,
        content: TARGET_PROMPT,
        variables: ITERATION_VARIABLES,
        sourceAssetId: 'asset-iter-already-saved',
        sourceImageUrl: 'https://cdn.example.com/references/iter-already-saved/original.png',
        createdAt: '2024-03-03T09:01:00.000Z',
        updatedAt: '2024-03-03T09:01:00.000Z',
      },
    ])

    await openIterations(page)
    await openDetail(page, 'Neon dusk saved study')
    await expectSavedState(page, savedTemplate.name)

    // “打开”→ /workspace/templates?focus=<id>，列表加载后定位高亮目标条目
    await openSavedMemoryButton(page).click()
    await expect(page).toHaveURL(/\/workspace\/templates/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: /^Style Memory$/i })).toBeVisible()

    const focusedCard = page.locator('[data-testid="style-memory-card"][data-focused="true"]')
    await expect(focusedCard).toHaveCount(1)
    await expect(focusedCard).toContainText(savedTemplate.name)
    await expect(focusedCard).toBeInViewport()

    // 参数消费后从 URL 清除（replace，不污染历史栈）
    await expect(page).not.toHaveURL(/focus=/, { timeout: 15000 })
  })

  test('TC-5.9 a 409 name conflict keeps the dialog open with the existing error copy and the entered values', async ({ page }) => {
    const capture = await mockTemplateCreateCapture(page, [
      {
        status: 409,
        body: {
          error: 'A template with this name already exists',
          code: 'TEMPLATE_NAME_CONFLICT',
          retryable: false,
        },
      },
    ])
    await mockIterationList(page, [
      iterationItem({ id: 'iter-save-source', status: 'completed', promptSummary: 'Neon dusk hero study' }),
    ])
    await mockIterationDetail(
      page,
      iterationDetail({ id: 'iter-save-source', status: 'completed', prompt: TARGET_PROMPT }),
    )

    await openIterations(page)
    await openDetail(page, 'Neon dusk hero study')
    await saveStyleMemoryButton(page).click()
    await dialogNameInput(page).fill('Duplicate memory name')
    await dialogSubmitButton(page).click()

    // 同名冲突：沿用既有错误文案在对话框内呈现
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(1)
    const dialog = saveDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/already exists|conflict/i)

    // 对话框保留已填内容：名称与预填内容不丢失，详情未切换为已保存态
    await expect(dialogNameInput(page)).toHaveValue('Duplicate memory name')
    await expect(dialogContentInput(page)).toHaveValue(TARGET_PROMPT)
    await expect(savedState(page)).toHaveCount(0)
    expect(capture.requests).toHaveLength(1)
  })
})
