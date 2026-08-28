import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAuthSession,
  mockGenerationList,
  mockIterationDetail,
  mockIterationList,
  mockStyleMemoryDetailCollection,
  mockTemplateCreateCapture,
  mockTemplateCreateCaptureSlow,
  type MockIterationDetail,
  type MockIterationListItem,
  type MockStyleMemoryDetail,
} from './helpers/mock-api'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

/**
 * plan-06 — 保存流程重构 E2E（red 先行）
 *
 * 来源：docs/14-可验证Style-Memory/14-2-实现计划-可验证Style-Memory/plan-06-保存流程重构.md
 * §实现规格 4 + §验收标准；架构 §6.3（保存链路与 V2 预填算法、A/B 流程差异）、
 * §7.3（POST /api/templates 扩展体 `SaveStyleMemoryRequest`）、ADR-1（状态服务端
 * 派生，前端只展示预期）；上游 PRD AC-04 / AC-08 / AC-11。
 *
 * 场景：流程 A（从完成 Iteration 三步向导：代表结果 → 保留规则与变量 → 命名）、
 * 流程 B（工作区草稿保存：无代表结果、pending verification）、保存进行中锁定、无提前必填
 * 错误、409 改名重试 / 5xx 直接重试（内容与步骤保留、无重复 Memory）、键盘
 * 往返（Tab 循环 / Escape 还原焦点 / 成功后详情焦点落首要内容）。
 *
 * ---------------------------------------------------------------------------
 * 页面契约（red → green 对齐用；复用 plan-03/05 已交付契约）：
 * - 流程 A 入口沿用：[data-testid="iteration-detail-actions"] 内按钮
 *   “Save as Style Memory”（/save (as )?style ?memory/i）
 * - 流程 B 入口沿用：工作区 prompt-card 头部按钮 “Save as Style Memory”
 *   （出现条件：工作区已有提示内容）
 * - 向导容器（两条流程共用骨架）：[data-testid="save-style-memory-dialog"]
 *   （role=dialog，ModalDialog 原语承载）
 * - 步骤容器：[data-testid="save-wizard-step-1"] / "save-wizard-step-2" /
 *   "save-wizard-step-3"，同一时间仅一个可见；流程 B 不渲染 step-1
 * - 步骤 1（仅流程 A）：并排参考图（img src 含 references/{iterationId}）与
 *   本次结果（img src 含 generated/{iterationId}），图注 exact「参考图」「本次结果」；
 *   勾选框 accessible name 含「Set as representative result」，默认不勾选；说明文案含「User verified」
 * - 步骤 2：V2 预填（styleInvariants[].value → 保留规则、hard 优先排序；
 *   negativeConstraints → 排除约束；optionalModifiers[].defaultValue → 增强方向；
 *   styleFingerprint.tokens → 风格指纹）；变量默认值同屏可编辑（label 含变量名，
 *   提交体携带编辑后值）；风格指纹/增强方向为只读快照展示；缺失组显示
 *   「No X from this iteration」标记（fallback 配方四组全缺失）
 * - 步骤 3：名称输入（label 含「名称」）、说明输入（label 含「说明」）、
 *   高级信息折叠预览完整提示（展开控件名含「高级信息|完整提示」）；底部固定
 *   「After saving:」随步骤 1 勾选联动（勾选→User verified / 不勾选→Pending verification）；
 *   名称中性帮助文案含「1-50」字样，错误文案仅在提交/失焦后出现
 * - 步骤导航按钮：Cancel（exact）/ Next / Back / ^Save（提交）
 * - 流程 B 首屏：[data-testid="save-wizard-no-representative-note"]，
 *   文案含「No representative result yet」与「Pending verification」；向导内无「Set as representative result」勾选框
 * - 提交体（SaveStyleMemoryRequest）：流程 A 勾选 → representativeGenerationTaskId
 *   = sourceGenerationTaskId = 迭代 id；不勾选 → 无 representativeGenerationTaskId
 *   （sourceGenerationTaskId 仍携带）；流程 B → 两者均不携带、携带 sourceAssetId；
 *   两流程均不提交 verificationStatus（ADR-1）
 * - 保存成功：router.push('/workspace/templates/{id}')（plan-05 详情页），
 *   新详情初始焦点落首要内容（h1 标题，tabIndex=-1 聚焦）
 * ---------------------------------------------------------------------------
 */

/** 既有 V2 recipe fixture（analysis-v2-completed.json.recipe）作为迭代/工作区配方快照 */
const V2_RECIPE = (loadFixture('analysis-v2-completed.json') as { recipe: object }).recipe

/** fallback 配方（无规则结构，`VisualRecipeV2Fallback`）— 缺失标记场景 */
const FALLBACK_RECIPE = {
  schemaVersion: 2,
  extractionStatus: 'fallback',
  extractionReasons: ['structure_failed'],
  promptOutputs: null,
}

const TARGET_PROMPT = 'Neon dusk hero study with amber glass towers'
/** 与配方 negativeConstraints 取不同值：证明 V2 排除约束预填来自配方而非快照文本 */
const TARGET_NEGATIVE_SNAPSHOT = 'heavy grain overlay, embedded text'

const ITERATION_ID = 'iter-save-flow'
const ITERATION_ASSET_ID = 'asset-iter-save-flow'
const ITERATION_SUMMARY = 'Neon dusk hero study'

/** V2 hard 不变量值（预填 → 保留规则；soft 'calm restrained mood' 排在其后） */
const HARD_RULES = [
  'warm amber and sand palette',
  'soft directional window light',
  'editorial product photography',
  'matte linen against polished glass',
]
const SOFT_RULE = 'calm restrained mood'

const ITERATION_VARIABLES = [
  { name: 'subject', label: 'Subject', defaultValue: 'amber bottle', sourceField: 'subject' },
  {
    name: 'environment',
    label: 'Environment',
    defaultValue: 'quiet studio table',
    sourceField: 'environment',
  },
]

function iterationDetail(
  overrides: {
    id?: string
    prompt?: string
    recipe?: object | null
    recipeSource?: MockIterationDetail['recipeSource']
  } = {},
): MockIterationDetail {
  const id = overrides.id ?? ITERATION_ID
  return {
    id,
    analysisTaskId: `analysis-${id}`,
    status: 'completed',
    promptSnapshot: overrides.prompt ?? TARGET_PROMPT,
    negativePromptSnapshot: TARGET_NEGATIVE_SNAPSHOT,
    params: { aspectRatio: '16:9', quality: 'hd' },
    modelName: 'black-forest-2.5',
    resultFileUrl: `https://cdn.example.com/generated/${id}/result.webp`,
    errorMessage: null,
    recipe: overrides.recipe !== undefined ? overrides.recipe : V2_RECIPE,
    recipeSource: overrides.recipeSource ?? 'snapshot',
    variables: ITERATION_VARIABLES,
    variablesSource: 'snapshot',
    sourceImageUrl: `https://cdn.example.com/references/${id}/original.png`,
    sourceAssetId: ITERATION_ASSET_ID,
    sourceTemplateId: null,
    sourceTemplateName: null,
    savedTemplate: null,
    analysisTemplateVariables: ITERATION_VARIABLES,
    createdAt: '2026-08-20T09:00:00.000Z',
    updatedAt: '2026-08-20T09:00:30.000Z',
  }
}

function iterationItem(
  overrides: { id?: string; promptSummary?: string } = {},
): MockIterationListItem {
  const id = overrides.id ?? ITERATION_ID
  return {
    id,
    status: 'completed',
    promptSummary: overrides.promptSummary ?? ITERATION_SUMMARY,
    resultFileUrl: `https://cdn.example.com/generated/${id}/result.webp`,
    params: { aspectRatio: '16:9', quality: 'hd' },
    createdAt: '2026-08-20T09:00:00.000Z',
  }
}

/** 保存成功跳转目标：新 Memory 详情（plan-05 详情页契约） */
function savedMemoryDetail(
  overrides: {
    id: string
    name: string
    verificationStatus: MockStyleMemoryDetail['verificationStatus']
    representativeGenerationTaskId?: string | null
  },
): MockStyleMemoryDetail {
  const hasRepresentative = Boolean(overrides.representativeGenerationTaskId)
  return {
    id: overrides.id,
    name: overrides.name,
    description: null,
    content: TARGET_PROMPT,
    variables: ITERATION_VARIABLES,
    retainedRules: HARD_RULES,
    negativeConstraints: ['watermark', 'distorted glass'],
    styleTokens: ['editorial', 'warm neutral', 'soft window light'],
    enhancementHints: ['calm', 'warm amber'],
    verificationStatus: overrides.verificationStatus,
    representativeGenerationTaskId: overrides.representativeGenerationTaskId ?? null,
    sourceAssetId: ITERATION_ASSET_ID,
    sourceImageUrl: `https://cdn.example.com/references/${ITERATION_ID}/original.png`,
    sourceGenerationTaskId: ITERATION_ID,
    sourceGenerationTask: { id: ITERATION_ID, createdAt: '2026-08-20T09:00:00.000Z' },
    representativeResult: hasRepresentative
      ? {
          iterationId: ITERATION_ID,
          imageUrl: `https://cdn.example.com/generated/${ITERATION_ID}/result.webp`,
          createdAt: '2026-08-20T09:00:30.000Z',
        }
      : null,
    usage: { lastUsedAt: null, derivedIterationCount: 0 },
    createdAt: '2026-08-26T09:00:00.000Z',
    updatedAt: '2026-08-26T09:00:00.000Z',
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

function detailPanel(page: Page) {
  return page.getByTestId('iteration-detail-panel')
}

function saveStyleMemoryButton(page: Page) {
  return page
    .getByTestId('iteration-detail-actions')
    .getByRole('button', { name: /save (as )?style ?memory/i })
}

function saveDialog(page: Page) {
  return page.getByTestId('save-style-memory-dialog')
}

function wizardStep(page: Page, step: 1 | 2 | 3) {
  return page.getByTestId(`save-wizard-step-${step}`)
}

function representativeCheckbox(page: Page) {
  return saveDialog(page).getByRole('checkbox', { name: /Set as representative result/ })
}

function nextButton(page: Page) {
  return saveDialog(page).getByRole('button', { name: /^Next$/ })
}

function prevButton(page: Page) {
  return saveDialog(page).getByRole('button', { name: /^Back$/ })
}

function submitButton(page: Page) {
  return saveDialog(page).getByRole('button', { name: /^Sav/i }) // 匹配 Save Style Memory 与 Saving… 两个状态
}

function nameInput(page: Page) {
  return saveDialog(page).getByRole('textbox', { name: /name/i }).first()
}

/** 步骤 3 底部固定「保存后状态」行（唯一文本节点，随勾选联动） */
function saveStatusText(page: Page) {
  return wizardStep(page, 3).getByText(/After saving:/)
}

const NAME_ERROR = /cannot be empty|required|A name is required|Enter a template name/

/** 打开流程 A 向导：进入 iterations → 打开详情 → 点保存入口 */
async function openFlowAWizard(page: Page, detail: MockIterationDetail = iterationDetail()) {
  await mockIterationList(page, [iterationItem({ id: detail.id })])
  await mockIterationDetail(page, detail)
  await openIterations(page)
  await page
    .getByTestId('iteration-list-item')
    .filter({ hasText: ITERATION_SUMMARY })
    .click()
  await expect(detailPanel(page)).toBeVisible()
  await saveStyleMemoryButton(page).click()
  const dialog = saveDialog(page)
  await expect(dialog).toBeVisible()
  return dialog
}

/** 等待键盘焦点位于容器内（键盘断言前确认 DOM 聚焦） */
async function expectFocusWithin(container: Locator) {
  await expect
    .poll(async () => container.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true)
}

/** 连续 Tab 仍被限制在容器内（焦点循环，背景不可达） */
async function pressTabAndAssertTrap(page: Page, container: Locator, presses: number) {
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press('Tab')
    await expectFocusWithin(container)
  }
}

test.describe('plan-06 保存流程重构', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockCdnImages(page)
    await mockGenerationList(page)
  })

  // ─── AC-04 流程 A：三步向导（从完成 Iteration 保存） ───

  test('TC-4.1 step 1: reference and result side by side, Set as representative result unchecked by default with verified semantics note', async ({
    page,
  }) => {
    await openFlowAWizard(page)

    const step1 = wizardStep(page, 1)
    await expect(step1).toBeVisible()
    // 步骤指示（PRD 线框「步骤 1 / 3」）
    await expect(saveDialog(page).getByText(/1\s*\/\s*3/)).toBeVisible()

    // 并排参考图与本次结果（来源 Iteration 的 sourceImageUrl / resultFileUrl）
    await expect(step1.locator(`img[src*="references/${ITERATION_ID}"]`)).toBeVisible()
    await expect(step1.locator(`img[src*="generated/${ITERATION_ID}"]`)).toBeVisible()
    await expect(step1.getByText('Reference', { exact: true })).toBeVisible()
    await expect(step1.getByText('Result', { exact: true })).toBeVisible()

    // 默认不勾选（Q5 决策）；说明文案说明勾选后的已验证语义
    const checkbox = representativeCheckbox(page)
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()
    await expect(step1.getByText(/User verified/)).toBeVisible()

    // 步骤 1 无名称等必填错误（首屏不提前报错）
    await expect(saveDialog(page).getByText(NAME_ERROR)).toHaveCount(0)
    await expect(nextButton(page)).toBeEnabled()
  })

  test('TC-4.2 步骤 2：V2 规则四元组预填（hard 优先）与排除约束来自配方，变量默认值同屏可编辑', async ({
    page,
  }) => {
    await openFlowAWizard(page)
    await nextButton(page).click()

    const step2 = wizardStep(page, 2)
    await expect(step2).toBeVisible()

    // 保留规则 ← styleInvariants[].value（4 条 hard 全部预填）
    for (const rule of HARD_RULES) {
      await expect(step2.getByText(rule)).toBeVisible()
    }
    // hard 优先排序：soft 规则排在全部 hard 之后
    const softIndex = await step2
      .getByText(SOFT_RULE)
      .first()
      .evaluate((node, needle) => {
        const text = node.closest('[data-testid="save-wizard-step-2"]')?.textContent ?? ''
        return text.indexOf(needle)
      }, SOFT_RULE)
    for (const rule of HARD_RULES) {
      const ruleIndex = await step2
        .getByText(rule)
        .first()
        .evaluate((node, needle) => {
          const text = node.closest('[data-testid="save-wizard-step-2"]')?.textContent ?? ''
          return text.indexOf(needle)
        }, rule)
      expect(softIndex, `soft rule must sort after hard rule "${rule}"`).toBeGreaterThan(
        ruleIndex,
      )
    }

    // 排除约束 ← 配方 negativeConstraints（非 negativePromptSnapshot 文本）
    await expect(step2.getByText('watermark', { exact: true })).toBeVisible()
    await expect(step2.getByText('distorted glass', { exact: true })).toBeVisible()
    await expect(step2.getByText(/heavy grain overlay/)).toHaveCount(0)

    // 增强方向 ← optionalModifiers[].defaultValue；风格指纹 ← styleFingerprint.tokens（快照展示）
    await expect(step2.getByText('calm', { exact: true })).toBeVisible()
    await expect(step2.getByText('warm amber', { exact: true })).toBeVisible()
    await expect(step2.getByText('editorial', { exact: true })).toBeVisible()
    await expect(step2.getByText('warm neutral', { exact: true })).toBeVisible()
    await expect(step2.getByText('soft window light', { exact: true })).toBeVisible()

    // 可替换变量同屏：默认值可见且可编辑（编辑值随提交体携带）
    const environmentInput = step2.getByLabel(/environment/i)
    await expect(environmentInput).toHaveValue('quiet studio table')
    await environmentInput.fill('night market stall')
    await expect(step2.getByLabel(/subject/i)).toHaveValue('amber bottle')
  })

  test('TC-4.3 step 3: naming and advanced full-prompt preview, after-saving status line reacts to the representative checkbox', async ({
    page,
  }) => {
    await openFlowAWizard(page)

    // 勾选代表结果 → 步骤 3 预期「User verified」
    await representativeCheckbox(page).check()
    await nextButton(page).click()
    await expect(wizardStep(page, 2)).toBeVisible()
    await nextButton(page).click()

    const step3 = wizardStep(page, 3)
    await expect(step3).toBeVisible()
    await expect(saveStatusText(page)).toContainText('User verified')
    await expect(saveStatusText(page)).not.toContainText('Pending verification')

    // 高级信息：完整提示默认折叠，展开后可见 promptSnapshot（取提示尾部片段避免截断预览误命中）
    await expect(step3.getByText(/amber glass towers/)).toHaveCount(0)
    await step3.getByRole('button', { name: /Advanced/ }).click()
    await expect(step3.getByText(TARGET_PROMPT)).toBeVisible()

    // 返回步骤 1 取消勾选 → 步骤 3 联动为「Pending verification」（PRD：取消勾选后仍可保存）
    await prevButton(page).click()
    await prevButton(page).click()
    await expect(wizardStep(page, 1)).toBeVisible()
    await representativeCheckbox(page).uncheck()
    await nextButton(page).click()
    await nextButton(page).click()
    await expect(saveStatusText(page)).toContainText('Pending verification')
    await expect(saveStatusText(page)).not.toContainText('User verified')
  })

  test('TC-4.4 save with representative checked: body carries representativeGenerationTaskId, success enters the new detail (User verified)', async ({
    page,
  }) => {
    const templateName = 'Neon Dusk Verified Memory'
    const capture = await mockTemplateCreateCapture(page, [
      {
        status: 201,
        body: {
          id: 'tpl-save-verified-flow',
          name: templateName,
          verificationStatus: 'user_verified',
        },
      },
    ])
    await mockStyleMemoryDetailCollection(page, [
      savedMemoryDetail({
        id: 'tpl-save-verified-flow',
        name: templateName,
        verificationStatus: 'user_verified',
        representativeGenerationTaskId: ITERATION_ID,
      }),
    ])

    await openFlowAWizard(page)
    await representativeCheckbox(page).check()
    await nextButton(page).click()
    // 编辑变量默认值：确认值随提交体携带
    await wizardStep(page, 2).getByLabel(/environment/i).fill('night market stall')
    await nextButton(page).click()
    await nameInput(page).fill(templateName)
    await submitButton(page).click()

    // 恰好一次 POST，扩展体按 SaveStyleMemoryRequest 携带规则四元组与代表结果
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(1)
    const body = capture.requests[0].body
    expect(body.name).toBe(templateName)
    expect(body.content).toBe(TARGET_PROMPT)
    expect(body.sourceAssetId).toBe(ITERATION_ASSET_ID)
    expect(body.sourceGenerationTaskId).toBe(ITERATION_ID)
    expect(body.representativeGenerationTaskId).toBe(ITERATION_ID)
    expect(body.retainedRules).toEqual(expect.arrayContaining(HARD_RULES))
    expect(body.negativeConstraints).toEqual(expect.arrayContaining(['watermark', 'distorted glass']))
    expect(body.styleTokens).toEqual(
      expect.arrayContaining(['editorial', 'warm neutral', 'soft window light']),
    )
    expect(body.enhancementHints).toEqual(expect.arrayContaining(['calm', 'warm amber']))
    expect(body.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'subject', defaultValue: 'amber bottle' }),
        expect.objectContaining({ name: 'environment', defaultValue: 'night market stall' }),
      ]),
    )
    // ADR-1：状态只能服务端派生，请求体不得携带
    expect(body.verificationStatus).toBeUndefined()

    // 成功 → router.push 新详情（plan-05 详情页）：User verified + 名称
    await expect(page).toHaveURL(/\/workspace\/templates\/tpl-save-verified-flow$/, {
      timeout: 15000,
    })
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('style-memory-detail-header').getByText('User verified')).toBeVisible()
    await expect(page.getByRole('heading', { name: templateName })).toBeVisible()
  })

  test('TC-4.5 save without representative: body omits representativeGenerationTaskId, success enters the new detail (Pending verification)', async ({
    page,
  }) => {
    const templateName = 'Neon Dusk Pending Memory'
    const capture = await mockTemplateCreateCapture(page, [
      {
        status: 201,
        body: {
          id: 'tpl-save-pending-flow',
          name: templateName,
          verificationStatus: 'pending_verification',
        },
      },
    ])
    await mockStyleMemoryDetailCollection(page, [
      savedMemoryDetail({
        id: 'tpl-save-pending-flow',
        name: templateName,
        verificationStatus: 'pending_verification',
        representativeGenerationTaskId: null,
      }),
    ])

    await openFlowAWizard(page)
    // 默认不勾选，直接走完三步
    await expect(representativeCheckbox(page)).not.toBeChecked()
    await nextButton(page).click()
    await nextButton(page).click()
    await nameInput(page).fill(templateName)
    await submitButton(page).click()

    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(1)
    const body = capture.requests[0].body
    expect(body.representativeGenerationTaskId).toBeUndefined()
    expect(body.sourceGenerationTaskId).toBe(ITERATION_ID)

    await expect(page).toHaveURL(/\/workspace\/templates\/tpl-save-pending-flow$/, {
      timeout: 15000,
    })
    await expect(page.getByTestId('style-memory-detail-header').getByText('Pending verification')).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByTestId('style-memory-detail-header').getByText('User verified')).toHaveCount(0)
  })

  test('TC-4.6 fallback 配方：步骤 2 四组缺失标记，不推测补齐且流程可继续', async ({ page }) => {
    await openFlowAWizard(
      page,
      iterationDetail({ id: 'iter-save-fallback', recipe: FALLBACK_RECIPE, recipeSource: 'fallback' }),
    )
    await nextButton(page).click()

    const step2 = wizardStep(page, 2)
    await expect(step2).toBeVisible()
    // 四组（保留规则/排除约束/风格指纹/增强方向）全部缺失标记
    await expect
      .poll(() => step2.getByText(/No .* from this iteration/).count(), { timeout: 10000 })
      .toBeGreaterThanOrEqual(4)
    // 不推测补齐：不出现配方外的规则/指纹文本
    await expect(step2.getByText(/warm amber and sand palette/)).toHaveCount(0)
    await expect(step2.getByText('editorial', { exact: true })).toHaveCount(0)

    // 流程可继续（保存空规则 pending Memory 的路径不被阻断）
    await expect(nextButton(page)).toBeEnabled()
    await nextButton(page).click()
    await expect(wizardStep(page, 3)).toBeVisible()
  })

  test('TC-4.7 无提前必填错误：中性帮助文案存在，错误仅在提交/失焦后出现且空名零 POST', async ({
    page,
  }) => {
    const capture = await mockTemplateCreateCapture(page)
    await openFlowAWizard(page)
    await nextButton(page).click()
    await nextButton(page).click()

    const step3 = wizardStep(page, 3)
    await expect(step3).toBeVisible()
    // 首次渲染：中性帮助文案存在，错误文案不存在
    await expect(step3.getByText(/1.{0,2}50/)).toBeVisible()
    await expect(saveDialog(page).getByText(NAME_ERROR)).toHaveCount(0)

    // 空名提交：错误出现，且未发出保存请求
    await submitButton(page).click()
    await expect(saveDialog(page).getByText(NAME_ERROR)).toBeVisible()
    expect(capture.requests, 'empty name must not issue a template create request').toHaveLength(0)

    // 失焦同样触发错误（清空后 Tab 离开名称输入）
    await nameInput(page).fill('Temporary name')
    await nameInput(page).fill('')
    await page.keyboard.press('Tab')
    await expect(saveDialog(page).getByText(NAME_ERROR)).toBeVisible()
    expect(capture.requests).toHaveLength(0)
  })

  test('TC-4.8 保存进行中：按钮锁定、连点只发一次 POST、已确认内容保留', async ({ page }) => {
    const templateName = 'Neon Dusk Locked Memory'
    const capture = await mockTemplateCreateCaptureSlow(
      page,
      {
        status: 201,
        body: {
          id: 'tpl-save-locked-flow',
          name: templateName,
          verificationStatus: 'user_verified',
        },
      },
      2000,
    )

    await openFlowAWizard(page)
    await representativeCheckbox(page).check()
    await nextButton(page).click()
    await nextButton(page).click()
    await nameInput(page).fill(templateName)
    await submitButton(page).click()

    // 进行中：提交/取消/步骤导航全部锁定
    await expect(submitButton(page)).toBeDisabled()
    await expect(saveDialog(page).getByRole('button', { name: /Cancel/ })).toBeDisabled()
    // 连点（force 越过 disabled 可点性探测）：仍只有一次在途 POST
    await submitButton(page).click({ force: true }).catch(() => undefined)
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(1)
    // 进行中已确认内容保留（名称与勾选联动的状态文案）
    await expect(nameInput(page)).toHaveValue(templateName)
    await expect(saveStatusText(page)).toContainText('User verified')

    // 响应返回后成功进入新详情，且全程只有 1 次 POST
    await expect(page).toHaveURL(/\/workspace\/templates\/tpl-save-locked-flow$/, {
      timeout: 15000,
    })
    expect(capture.requests).toHaveLength(1)
  })

  // ─── AC-11 冲突与暂时失败的无损重试 ───

  test('TC-11.1 409 名称冲突：显示服务端文案、改名重试成功进新详情、无重复 Memory', async ({
    page,
  }) => {
    const conflictCopy = 'A template with this name already exists'
    const templateName = 'Neon Dusk Conflict Memory'
    const capture = await mockTemplateCreateCapture(page, [
      {
        status: 409,
        body: { error: conflictCopy, code: 'TEMPLATE_NAME_CONFLICT', retryable: false },
      },
      {
        status: 201,
        body: {
          id: 'tpl-save-conflict-flow',
          name: `${templateName} v2`,
          verificationStatus: 'user_verified',
        },
      },
    ])
    await mockStyleMemoryDetailCollection(page, [
      savedMemoryDetail({
        id: 'tpl-save-conflict-flow',
        name: `${templateName} v2`,
        verificationStatus: 'user_verified',
        representativeGenerationTaskId: ITERATION_ID,
      }),
    ])

    await openFlowAWizard(page)
    await representativeCheckbox(page).check()
    await nextButton(page).click()
    await nextButton(page).click()
    await nameInput(page).fill(templateName)
    await submitButton(page).click()

    // 409：服务端文案原样呈现，对话框保留在步骤 3
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(1)
    const dialog = saveDialog(page)
    await expect(dialog).toBeVisible()
    await expect(wizardStep(page, 3)).toBeVisible()
    await expect(dialog.getByText(conflictCopy)).toBeVisible()

    // 失败期间全部已确认内容保留：名称、勾选联动的状态文案与代表结果标记
    await expect(nameInput(page)).toHaveValue(templateName)
    await expect(saveStatusText(page)).toContainText('User verified')

    // 改名重试成功 → 新详情；全程 2 次 POST（1 冲突 + 1 成功），无重复 Memory
    await nameInput(page).fill(`${templateName} v2`)
    await submitButton(page).click()
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(2)
    expect(capture.requests[1].body.representativeGenerationTaskId).toBe(ITERATION_ID)

    await expect(page).toHaveURL(/\/workspace\/templates\/tpl-save-conflict-flow$/, {
      timeout: 15000,
    })
    await expect(page.getByTestId('style-memory-detail-header').getByText('User verified')).toBeVisible({
      timeout: 15000,
    })
    expect(capture.requests).toHaveLength(2)
  })

  test('TC-11.2 5xx 暂时失败：错误条可重试，直接重试成功进新详情，步骤与内容保留', async ({
    page,
  }) => {
    const templateName = 'Neon Dusk Retry Memory'
    const capture = await mockTemplateCreateCapture(page, [
      {
        status: 503,
        body: {
          error: 'Saving is temporarily unavailable. Please try again later.',
          code: 'SERVICE_UNAVAILABLE',
          retryable: true,
        },
      },
      {
        status: 201,
        body: {
          id: 'tpl-save-retry-flow',
          name: templateName,
          verificationStatus: 'user_verified',
        },
      },
    ])
    await mockStyleMemoryDetailCollection(page, [
      savedMemoryDetail({
        id: 'tpl-save-retry-flow',
        name: templateName,
        verificationStatus: 'user_verified',
        representativeGenerationTaskId: ITERATION_ID,
      }),
    ])

    await openFlowAWizard(page)
    await representativeCheckbox(page).check()
    await nextButton(page).click()
    await nextButton(page).click()
    await nameInput(page).fill(templateName)
    await submitButton(page).click()

    // 5xx：错误条说明原因与下一步；步骤 3 与全部已确认内容保留
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(1)
    const dialog = saveDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/temporarily unavailable/)).toBeVisible()
    await expect(wizardStep(page, 3)).toBeVisible()
    await expect(nameInput(page)).toHaveValue(templateName)
    await expect(saveStatusText(page)).toContainText('User verified')

    // 直接重试（不改任何内容）成功 → 新详情；2 次 POST，重试体与首次一致
    await submitButton(page).click()
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(2)
    expect(capture.requests[1].body).toEqual(capture.requests[0].body)

    await expect(page).toHaveURL(/\/workspace\/templates\/tpl-save-retry-flow$/, {
      timeout: 15000,
    })
    await expect(page.getByTestId('style-memory-detail-header').getByText('User verified')).toBeVisible({
      timeout: 15000,
    })
  })

  // ─── AC-08 键盘连续操作 ───

  test('TC-8.1 键盘：向导内 Tab 循环、Escape 取消还原触发焦点、键盘完成保存后详情焦点落首要内容', async ({
    page,
  }) => {
    const templateName = 'Neon Dusk Keyboard Memory'
    const capture = await mockTemplateCreateCapture(page, [
      {
        status: 201,
        body: {
          id: 'tpl-save-keyboard-flow',
          name: templateName,
          verificationStatus: 'user_verified',
        },
      },
    ])
    await mockStyleMemoryDetailCollection(page, [
      savedMemoryDetail({
        id: 'tpl-save-keyboard-flow',
        name: templateName,
        verificationStatus: 'user_verified',
        representativeGenerationTaskId: ITERATION_ID,
      }),
    ])

    await mockIterationList(page, [iterationItem()])
    await mockIterationDetail(page, iterationDetail())
    await openIterations(page)
    await page
      .getByTestId('iteration-list-item')
      .filter({ hasText: ITERATION_SUMMARY })
      .click()
    await expect(detailPanel(page)).toBeVisible()

    // 键盘打开向导
    const entry = saveStyleMemoryButton(page)
    await entry.focus()
    await page.keyboard.press('Enter')
    const dialog = saveDialog(page)
    await expect(dialog).toBeVisible()
    await expectFocusWithin(dialog)

    // Tab 循环：焦点限制在弹层内（AC-08）
    await pressTabAndAssertTrap(page, dialog, 10)

    // Escape 取消：关闭并还原焦点到触发按钮
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(entry).toBeFocused()

    // 重新打开，仅键盘完成三步：Space 勾选 → Enter 下一步 ×2 → 键入名称 → Enter 保存
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    const checkbox = representativeCheckbox(page)
    await checkbox.focus()
    await page.keyboard.press('Space')
    await expect(checkbox).toBeChecked()

    await nextButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(wizardStep(page, 2)).toBeVisible()
    await nextButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(wizardStep(page, 3)).toBeVisible()

    await nameInput(page).focus()
    await page.keyboard.type(templateName)
    await submitButton(page).focus()
    await page.keyboard.press('Enter')

    // 保存成功 → 新详情，初始焦点落首要内容（标题 h1）
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(1)
    await expect(page).toHaveURL(/\/workspace\/templates\/tpl-save-keyboard-flow$/, {
      timeout: 15000,
    })
    await expect(page.getByRole('heading', { name: templateName })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: templateName })).toBeFocused()
  })

  // ─── AC-04 流程 B：工作区草稿保存（无代表结果） ───

  test('TC-4.9 flow B: first screen notes save-as-pending, after rule confirmation the body omits representative/source iteration and enters the new detail (Pending verification)', async ({
    page,
  }) => {
    const templateName = 'Workspace Draft Direction'
    const capture = await mockTemplateCreateCapture(page, [
      {
        status: 201,
        body: {
          id: 'tpl-save-workspace-draft',
          name: templateName,
          verificationStatus: 'pending_verification',
        },
      },
    ])
    const draftDetail: MockStyleMemoryDetail = {
      ...savedMemoryDetail({
        id: 'tpl-save-workspace-draft',
        name: templateName,
        verificationStatus: 'pending_verification',
        representativeGenerationTaskId: null,
      }),
      sourceGenerationTaskId: null,
      sourceGenerationTask: null,
    }
    await mockStyleMemoryDetailCollection(page, [draftDetail])

    // 工作区进入 analysis_ready（V2 配方 + 提示内容 → 保存入口可见）
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'save-flow-analysis-task',
      analysisResponse: loadFixture('analysis-v2-completed.json'),
    })
    await page.getByRole('button', { name: 'Save as Style Memory' }).click()

    // 首屏：无代表结果说明（原单步表单前的说明区）+ pending 预期；无步骤 1 与代表结果勾选
    const dialog = saveDialog(page)
    await expect(dialog).toBeVisible()
    const note = page.getByTestId('save-wizard-no-representative-note')
    await expect(note).toBeVisible()
    await expect(note.getByText(/No representative result yet/)).toBeVisible()
    await expect(note.getByText(/Pending verification/)).toBeVisible()
    await expect(wizardStep(page, 1)).toHaveCount(0)
    await expect(representativeCheckbox(page)).toHaveCount(0)
    // 首屏无提前必填错误
    await expect(dialog.getByText(NAME_ERROR)).toHaveCount(0)

    // 规则确认（工作区 V2 配方预填）→ 命名保存
    const step2 = wizardStep(page, 2)
    await expect(step2).toBeVisible()
    await expect(step2.getByText('soft directional window light')).toBeVisible()
    await nextButton(page).click()

    const step3 = wizardStep(page, 3)
    await expect(step3).toBeVisible()
    // 中性帮助文案存在、错误文案不存在（流程 B 同口径）
    await expect(step3.getByText(/1.{0,2}50/)).toBeVisible()
    await expect(dialog.getByText(NAME_ERROR)).toHaveCount(0)
    await expect(saveStatusText(page)).toContainText('Pending verification')
    await nameInput(page).fill(templateName)
    await submitButton(page).click()

    // 提交体：不含 representativeGenerationTaskId / sourceGenerationTaskId；携带来源资产与规则
    await expect
      .poll(() => capture.requests.length, { timeout: 15000 })
      .toBe(1)
    const body = capture.requests[0].body
    expect(body.name).toBe(templateName)
    expect(body.representativeGenerationTaskId).toBeUndefined()
    expect(body.sourceGenerationTaskId).toBeUndefined()
    expect(body.sourceAssetId).toBe('mock-asset-id')
    expect(body.retainedRules).toEqual(expect.arrayContaining(HARD_RULES))
    expect(body.verificationStatus).toBeUndefined()

    // 成功 → 新详情：pending verification、无代表结果图
    await expect(page).toHaveURL(/\/workspace\/templates\/tpl-save-workspace-draft$/, {
      timeout: 15000,
    })
    await expect(page.getByTestId('style-memory-detail-header').getByText('Pending verification')).toBeVisible({
      timeout: 15000,
    })
    await expect(
      page.getByTestId('style-memory-detail-evidence').locator('img[src*="generated/"]'),
    ).toHaveCount(0)
  })
})
