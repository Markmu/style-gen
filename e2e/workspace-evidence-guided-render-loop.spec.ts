import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'path'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisCreateCapture,
  mockAnalysisCreateSequence,
  mockAnalysisPolling,
  mockAnalysisPollingSequence,
  mockAuthSession,
  mockCdnImages,
  mockDirectionFeedStateful,
  mockGenerationCreateCapture,
  mockGenerationCreateSequence,
  mockGenerationList,
  mockGenerationPolling,
  mockIterationDetailSequence,
  mockIterationDetailStateful,
  mockIterationList,
  mockStyleMemoryDetailCollection,
  mockTemplateCreateCapture,
  mockUploadPresign,
  type DirectionFeedRequestQuery,
  type MockDirectionFeedItem,
  type MockIterationDetail,
  type MockIterationListItem,
  type MockRepresentativeCandidate,
  type MockStyleMemoryDetail,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'
import {
  chooseQuickRecreatePace,
  confirmQuickRecreate,
  exitQuickRecreate,
  gotoWorkspace,
} from './helpers/workspace-actions'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

/** 轮询中的分析任务（停留在 processing，驱动 armed 期间的等待窗口） */
const PROCESSING_ANALYSIS = {
  status: 'processing',
  recipe: null,
  promptText: null,
  negativePromptText: null,
  errorMessage: null,
  errorStage: null,
}

/** V2 分析失败终态（L4：快速授权必须复位 none） */
const FAILED_ANALYSIS = {
  status: 'failed',
  recipe: null,
  promptText: null,
  negativePromptText: null,
  // 注：errorMessage 不得包含「analysis failed」子串——getByText 默认子串匹配，
  // 否则会与 ReferenceCard 既有的「Analysis failed」标题产生 strict mode 二义性。
  errorMessage: 'Vision stage failed',
  errorStage: 'vision',
}

function referenceColumn(page: Page) {
  return page.getByRole('region', { name: 'Reference Canvas column' })
}

function referenceCard(page: Page) {
  return referenceColumn(page).getByTestId('reference-card')
}

function renderDock(page: Page) {
  return page.getByTestId('output-card')
}

/** 上传测试参考图（100×100，参考比 1:1），走可见 drop-zone 的 file input */
async function uploadReference(page: Page) {
  const input = referenceColumn(page).locator('input[type="file"]')
  await waitForReactInput(input)
  await input.setInputFiles(TEST_IMAGE_PATH)
}

/**
 * TC-2.1 / TC-2.9 共享：快速路径与深入路径证据完整度一致的同一断言集合
 * （架构 §6.1 实现原则：两路径共享完整分析、Prompt 编译与生成 API）。
 */
async function expectDirectionEvidenceComplete(page: Page) {
  await page
    .locator('[data-testid="ai-status-header"][data-phase="analysis_ready"]')
    .first()
    .waitFor({ timeout: 15000 })
  await expect(page.getByTestId('recipe-card')).toBeVisible()
  await expect(page.getByTestId('content-analysis')).toBeVisible()
  await expect(page.getByTestId('style-invariants')).toBeVisible()
  await expect(page.getByTestId('evidence-facet-visualMedium')).toBeVisible()
  await expect(
    page
      .locator('[data-testid="unified-prompt-editor"], [data-testid="structured-prompt-editor"]')
      .first(),
  ).toBeVisible()
  await expect(renderDock(page)).toBeVisible()
}

test.describe('plan-02：快速创作节奏与工作区状态（AC-01 / AC-07）', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
    await gotoWorkspace(page)
  })

  test('TC-2.1 深入路径默认 analyze_edit，分析完成后停在可编辑态且零 generation POST', async ({ page }) => {
    const analysisTaskId = 'deep-path-analysis-task'
    const generation = await mockGenerationCreateCapture(page)
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, {
      ...loadFixture('analysis-v2-completed.json'),
      id: analysisTaskId,
    })

    const selector = page.getByTestId('creation-pace-selector')
    await expect(selector).toBeVisible({ timeout: 10000 })
    await expect(selector.getByTestId('pace-option-analyze-edit')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await uploadReference(page)
    await expectDirectionEvidenceComplete(page)
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-2.2 快速确认披露五类信息：intent、detail、画幅策略、生成设置与单张生成', async ({ page }) => {
    const generation = await mockGenerationCreateCapture(page)

    const dialog = await chooseQuickRecreatePace(page)

    await expect(dialog.getByTestId('quick-confirm-title')).toBeFocused()
    await expect(dialog.getByTestId('quick-confirm-intent')).toHaveAttribute(
      'data-value',
      'reconstruction',
    )
    await expect(dialog.getByTestId('quick-confirm-detail-level')).toHaveAttribute(
      'data-value',
      'standard',
    )
    await expect(
      dialog.getByTestId('quick-confirm-aspect-ratio-policy'),
    ).toHaveAttribute('data-value', 'reference_or_fallback')

    // 披露的生成设置必须与当前共享默认值同源（确认 UI 与 Render Dock 消费同一默认）
    const defaultModel = await renderDock(page).getByLabel('Model').inputValue()
    await expect(dialog.getByTestId('quick-confirm-generation-settings')).toHaveAttribute(
      'data-quality',
      'standard',
    )
    await expect(dialog.getByTestId('quick-confirm-generation-settings')).toHaveAttribute(
      'data-model',
      defaultModel,
    )
    await expect(dialog.getByTestId('quick-confirm-image-count')).toHaveAttribute(
      'data-value',
      '1',
    )
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-2.3 快速路径分析 success 后恰好一次自动 POST，请求与确认快照一致', async ({ page }) => {
    const analysisTaskId = 'quick-path-analysis-task'
    const generationTaskId = 'quick-path-generation-task'
    const generation = await mockGenerationCreateCapture(page, generationTaskId)
    // plan-07 最小口径对齐（实现规格 §4）：成功终态以方向 feed 内联呈现，
    // 不再打开阻断式 GenerationDialog——seed feed 提供内联终态的可观察锚点。
    await mockDirectionFeedStateful(page, {
      completed: [directionItem(generationTaskId)],
      active: null,
      latestFailure: null,
    })
    await mockGenerationPolling(page, generationTaskId, {
      ...loadFixture('generation-completed.json'),
      id: generationTaskId,
    })
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, {
      ...loadFixture('analysis-v2-completed.json'),
      id: analysisTaskId,
    })

    await chooseQuickRecreatePace(page)
    const confirmedModel = await page
      .getByTestId('quick-confirm-generation-settings')
      .getAttribute('data-model')
    await confirmQuickRecreate(page)

    await uploadReference(page)

    await expect
      .poll(() => generation.requests.length, { timeout: 15000 })
      .toBe(1)

    const body = generation.requests[0].body as {
      analysisTaskId: unknown
      promptControlSnapshot: Record<string, unknown>
      params: Record<string, unknown>
      promptText: unknown
    }
    expect(body.analysisTaskId).toBe(analysisTaskId)
    expect(body.promptControlSnapshot).toMatchObject({
      trigger: 'quick_recreate',
      intent: 'reconstruction',
      detailLevel: 'standard',
    })
    expect(body.params).toMatchObject({ aspectRatio: '1:1', quality: 'standard' })
    expect(body.params.model).toBe(confirmedModel)
    expect(String(body.promptText ?? '').trim().length).toBeGreaterThan(0)

    // 生成到达终态后提交数仍为 1（轮询重复 success / effect 重放不重放）；
    // plan-07 新契约：终态内联进入方向结果区，阻断式弹层不出现（成功不弹层）
    await expect(completedRailItem(page, generationTaskId)).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByTestId('generation-dialog')).toBeHidden()
    expect(generation.requests).toHaveLength(1)
  })

  test('TC-2.4 armed 期间生成设置只读并说明退出方式', async ({ page }) => {
    const analysisTaskId = 'armed-lock-analysis-task'
    const generation = await mockGenerationCreateCapture(page)
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, {
      ...PROCESSING_ANALYSIS,
      id: analysisTaskId,
    })

    await chooseQuickRecreatePace(page)
    await confirmQuickRecreate(page)
    await uploadReference(page)

    await expect(page.getByTestId('quick-authorization-status')).toHaveAttribute(
      'data-authorization',
      'armed',
    )
    await expect(page.getByTestId('quick-authorization-locked-note')).toBeVisible()
    await expect(page.getByTestId('exit-quick-recreate')).toBeVisible()

    await expect(renderDock(page).getByLabel('Aspect Ratio')).toBeDisabled()
    await expect(renderDock(page).getByLabel('Quality')).toBeDisabled()
    await expect(renderDock(page).getByLabel('Model')).toBeDisabled()
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-2.5 自动提交后刷新不重放', async ({ page }) => {
    const analysisTaskId = 'reload-analysis-task'
    const generationTaskId = 'reload-generation-task'
    const generation = await mockGenerationCreateCapture(page, generationTaskId)
    // plan-07 最小口径对齐（实现规格 §4）：重载后终态按数据库事实（方向 feed）内联恢复
    await mockDirectionFeedStateful(page, {
      completed: [directionItem(generationTaskId)],
      active: null,
      latestFailure: null,
    })
    await mockGenerationPolling(page, generationTaskId, {
      ...loadFixture('generation-completed.json'),
      id: generationTaskId,
    })
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, {
      ...loadFixture('analysis-v2-completed.json'),
      id: analysisTaskId,
    })

    await chooseQuickRecreatePace(page)
    await confirmQuickRecreate(page)
    await uploadReference(page)

    await expect
      .poll(() => generation.requests.length, { timeout: 15000 })
      .toBe(1)

    await page.reload()
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible({
      timeout: 15000,
    })
    // 等待生成终态按数据库事实恢复（方向 feed 内联可见），给 mounted effect
    // 重放充分暴露窗口；plan-07 新契约：重载后成功内联恢复，不弹阻断式弹层
    await expect(completedRailItem(page, generationTaskId)).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByTestId('generation-dialog')).toBeHidden()
    expect(generation.requests).toHaveLength(1)
  })

  test('TC-2.6 分析失败清除 armed 快照并说明原因，参考上下文保留', async ({ page }) => {
    const analysisTaskId = 'failed-analysis-task'
    const generation = await mockGenerationCreateCapture(page)
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, {
      ...FAILED_ANALYSIS,
      id: analysisTaskId,
    })

    await chooseQuickRecreatePace(page)
    await confirmQuickRecreate(page)
    await uploadReference(page)

    await expect(referenceCard(page).getByText('Analysis failed')).toBeVisible({
      timeout: 15000,
    })
    await expect(referenceCard(page).getByTestId('reference-image-stage')).toBeVisible()
    await expect(page.getByTestId('quick-authorization-cleared-reason')).toBeVisible()
    await expect(page.getByTestId('quick-authorization-status')).toHaveAttribute(
      'data-authorization',
      'none',
    )
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-2.7 取消确认零写入，焦点回触发器且默认节奏不变', async ({ page }) => {
    const generation = await mockGenerationCreateCapture(page)

    const dialog = await chooseQuickRecreatePace(page)
    await dialog.getByTestId('quick-confirm-cancel').click()

    await expect(page.getByTestId('quick-confirm-dialog')).toBeHidden()
    await expect(page.getByTestId('pace-option-quick-recreate')).toBeFocused()
    await expect(page.getByTestId('pace-option-analyze-edit')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByTestId('reference-upload-panel')).toBeVisible()
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-2.8 分析期间退出快速路径：清授权、解锁设置、完成后不自动生成', async ({ page }) => {
    const analysisTaskId = 'exit-quick-analysis-task'
    const generation = await mockGenerationCreateCapture(page)
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPollingSequence(page, analysisTaskId, [
      { ...PROCESSING_ANALYSIS, id: analysisTaskId },
      { ...PROCESSING_ANALYSIS, id: analysisTaskId },
      { ...PROCESSING_ANALYSIS, id: analysisTaskId },
      { ...loadFixture('analysis-v2-completed.json'), id: analysisTaskId },
    ])

    await chooseQuickRecreatePace(page)
    await confirmQuickRecreate(page)
    await uploadReference(page)

    await exitQuickRecreate(page)
    await expect(renderDock(page).getByLabel('Aspect Ratio')).toBeEnabled()
    await expect(renderDock(page).getByLabel('Quality')).toBeEnabled()
    await expect(renderDock(page).getByLabel('Model')).toBeEnabled()
    await expect(referenceCard(page).getByTestId('reference-image-stage')).toBeVisible()

    await expectDirectionEvidenceComplete(page)
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-2.9 快速路径与深入路径证据完整度一致（共享证据断言集合）', async ({ page }) => {
    const analysisTaskId = 'parity-quick-analysis-task'
    const generationTaskId = 'parity-quick-generation-task'
    const generation = await mockGenerationCreateCapture(page, generationTaskId)
    await mockGenerationPolling(page, generationTaskId, {
      ...loadFixture('generation-completed.json'),
      id: generationTaskId,
    })
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, {
      ...loadFixture('analysis-v2-completed.json'),
      id: analysisTaskId,
    })

    await chooseQuickRecreatePace(page)
    await confirmQuickRecreate(page)
    await uploadReference(page)

    // 与 TC-2.1 完全相同的证据断言集合：快速路径不削弱证据完整度
    await expectDirectionEvidenceComplete(page)
    await expect
      .poll(() => generation.requests.length, { timeout: 15000 })
      .toBe(1)
  })

  test('TC-2.10 阻塞清除后条件恢复（重试分析成功）不延迟自动提交', async ({ page }) => {
    const failedTaskId = 'blocked-analysis-task'
    const recoveredTaskId = 'recovered-analysis-task'
    const generation = await mockGenerationCreateCapture(page)
    await mockUploadPresign(page)
    await mockAnalysisCreateSequence(page, [failedTaskId, recoveredTaskId])
    await mockAnalysisPolling(page, failedTaskId, { ...FAILED_ANALYSIS, id: failedTaskId })
    await mockAnalysisPolling(page, recoveredTaskId, {
      ...loadFixture('analysis-v2-completed.json'),
      id: recoveredTaskId,
    })

    await chooseQuickRecreatePace(page)
    await confirmQuickRecreate(page)
    await uploadReference(page)

    await expect(referenceCard(page).getByText('Analysis failed')).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByTestId('quick-authorization-status')).toHaveAttribute(
      'data-authorization',
      'none',
    )

    await referenceCard(page).getByRole('button', { name: 'Retry analysis' }).click()
    await expectDirectionEvidenceComplete(page)

    // 条件恢复后不复活 armed、不延迟自动提交
    await expect(page.getByTestId('quick-authorization-status')).toHaveAttribute(
      'data-authorization',
      'none',
    )
    expect(generation.requests).toHaveLength(0)
  })
})

// ─── plan-04：Prompt 控制与保留改变摘要（AC-02 / AC-03 / AC-05） ──────────────

const WORKSPACE_STORAGE_KEY = 'style-gen-workspace-state'

/** plan-01 唯一画幅白名单（架构 §6.3）：未知值不得进入 UI 或请求 */
const SUPPORTED_RATIOS = ['1:1', '4:3', '16:9', '3:4', '9:16']

/** fixture 的 5 条 enabled invariant 值：三档 detail 切换的恒等断言集合（架构 §6.2.2） */
const V2_INVARIANT_VALUES = [
  'warm amber and sand palette',
  'soft directional window light',
  'editorial product photography',
  'matte linen against polished glass',
  'calm restrained mood',
]

function promptCard(page: Page) {
  return page.getByTestId('prompt-card')
}

function promptControls(page: Page) {
  return page.getByTestId('prompt-intent-controls')
}

function keepChangeSummary(page: Page) {
  return page.getByTestId('keep-change-summary')
}

/** plan-04 共享：深入路径完成一次 V2 分析，到达 analysis_ready */
async function completeDeepAnalysis(
  page: Page,
  analysisTaskId: string,
  fixture = 'analysis-v2-completed.json',
) {
  await mockUploadPresign(page)
  await mockAnalysisCreate(page, analysisTaskId)
  await mockAnalysisPolling(page, analysisTaskId, {
    ...loadFixture(fixture),
    id: analysisTaskId,
  })
  await uploadReference(page)
  await page
    .locator('[data-testid="ai-status-header"][data-phase="analysis_ready"]')
    .first()
    .waitFor({ timeout: 15000 })
}

/**
 * plan-04 共享：在不消费工作台快照的 Iteration 列表页 seed 一份 v5 快照，
 * 再导航回 /workspace 让挂载逻辑消费（沿用 style-memory-reuse.spec.ts 的 seed 模式）。
 */
async function seedWorkspaceV5State(page: Page, state: Record<string, unknown>) {
  try {
    await page.goto('/workspace/iterations?status=all', {
      waitUntil: 'commit',
      timeout: 10000,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }
  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
  await page.evaluate(
    ([key, value]: [string, string]) => window.sessionStorage.setItem(key, value),
    [WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 5, ...state })] as [string, string],
  )
  await gotoWorkspace(page)
}

test.describe('plan-04：Prompt 控制与保留改变摘要（AC-02 / AC-03 / AC-05）', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
    await gotoWorkspace(page)
  })

  test('TC-4.1 分析完成后两轴与编辑方式默认态：same_style / standard / variables', async ({ page }) => {
    const generation = await mockGenerationCreateCapture(page)
    await completeDeepAnalysis(page, 'prompt-controls-default-analysis-task')

    const controls = promptControls(page)
    await expect(controls).toBeVisible({ timeout: 10000 })
    await expect(controls).toHaveAttribute('data-intent', 'same_style')
    await expect(controls).toHaveAttribute('data-detail', 'standard')
    await expect(controls).toHaveAttribute('data-editor-mode', 'variables')

    // 两轴为顶层：intent 两项 + detail 三项全部可见，默认选中态正确
    await expect(controls.getByTestId('intent-option-same-style')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(controls.getByTestId('intent-option-reconstruction')).toBeVisible()
    await expect(controls.getByTestId('detail-option-standard')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(controls.getByTestId('detail-option-concise')).toBeVisible()
    await expect(controls.getByTestId('detail-option-professional')).toBeVisible()

    // 编辑方式为次级入口：三入口全部可达
    await expect(controls.getByTestId('editor-mode-option-variables')).toBeVisible()
    await expect(controls.getByTestId('editor-mode-option-text')).toBeVisible()
    await expect(controls.getByTestId('editor-mode-option-structured')).toBeVisible()

    // 非 armed：无锁定说明，零自动生成
    await expect(page.getByTestId('prompt-controls-locked-note')).toBeHidden()
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-4.2 切换 intent 即时重编译：reconstruction 原内容与说明、invariant 恒等', async ({ page }) => {
    await completeDeepAnalysis(page, 'intent-switch-analysis-task')

    const controls = promptControls(page)
    await expect(controls).toBeVisible({ timeout: 10000 })
    const compiled = page.getByTestId('compiled-prompt-text')
    await expect(compiled).toBeVisible()

    // same_style 起步：编译消费变量当前值
    await expect(compiled).toContainText('amber bottle')

    // 未手动改写：切换即时生效，不出现覆盖确认（架构 §6.2.6）
    await controls.getByTestId('intent-option-reconstruction').click()
    await expect(controls).toHaveAttribute('data-intent', 'reconstruction')
    await expect(page.getByTestId('prompt-switch-confirm-dialog')).toBeHidden()
    await expect(compiled).toContainText('An amber bottle on folded linen')
    await expect(compiled).not.toContainText('{{')

    // invariant 恒等：全部已启用规则在 reconstruction 编译结果中保留
    for (const invariantValue of V2_INVARIANT_VALUES) {
      await expect(compiled).toContainText(invariantValue)
    }

    // reconstruction 摘要说明：同时参考原内容与风格（plan-04 规格 §2）
    await expect(page.getByTestId('keep-change-intent-note')).toBeVisible()
    await expect(keepChangeSummary(page)).toBeVisible()

    // 切回 same_style 恢复变量模板编译
    await controls.getByTestId('intent-option-same-style').click()
    await expect(controls).toHaveAttribute('data-intent', 'same_style')
    await expect(compiled).toContainText('amber bottle')
  })

  test('TC-4.3 三档 detail 切换：invariant 集合恒等、补充观察按档位变化', async ({ page }) => {
    await completeDeepAnalysis(page, 'detail-switch-analysis-task')

    const controls = promptControls(page)
    await expect(controls).toBeVisible({ timeout: 10000 })
    const compiled = page.getByTestId('compiled-prompt-text')
    await expect(compiled).toBeVisible()

    // concise：全部 enabled invariants 保留，但不加未覆盖 observation
    // （fixture 中 composition_1 无 invariant 覆盖，置信度 0.88）
    await controls.getByTestId('detail-option-concise').click()
    await expect(controls).toHaveAttribute('data-detail', 'concise')
    for (const invariantValue of V2_INVARIANT_VALUES) {
      await expect(compiled).toContainText(invariantValue)
    }
    await expect(compiled).not.toContainText('asymmetric thirds composition')

    // standard：每维至多补一条 ≥0.7 的未覆盖 observation
    await controls.getByTestId('detail-option-standard').click()
    await expect(controls).toHaveAttribute('data-detail', 'standard')
    for (const invariantValue of V2_INVARIANT_VALUES) {
      await expect(compiled).toContainText(invariantValue)
    }
    await expect(compiled).toContainText('asymmetric thirds composition')

    // professional：全部 ≥0.5 未覆盖 observation；invariant 集合仍恒等
    await controls.getByTestId('detail-option-professional').click()
    await expect(controls).toHaveAttribute('data-detail', 'professional')
    for (const invariantValue of V2_INVARIANT_VALUES) {
      await expect(compiled).toContainText(invariantValue)
    }
    await expect(compiled).toContainText('asymmetric thirds composition')
  })

  test('TC-4.4 变量值在 intent/detail 切换后保持并进入编译结果', async ({ page }) => {
    await completeDeepAnalysis(page, 'variable-keep-analysis-task')

    const controls = promptControls(page)
    await expect(controls).toBeVisible({ timeout: 10000 })
    const subjectInput = promptCard(page).getByLabel('Subject')
    await expect(subjectInput).toBeVisible()

    await subjectInput.fill('ceramic vase')
    const compiled = page.getByTestId('compiled-prompt-text')
    await expect(compiled).toContainText('ceramic vase')

    // 切换 intent 与 detail 均不丢变量（AC-02：变量与排除项保持）
    await controls.getByTestId('intent-option-reconstruction').click()
    await expect(compiled).toContainText('An amber bottle on folded linen')
    await controls.getByTestId('intent-option-same-style').click()
    await controls.getByTestId('detail-option-professional').click()
    await expect(subjectInput).toHaveValue('ceramic vase')
    await expect(compiled).toContainText('ceramic vase')
  })

  test('TC-4.5 三编辑入口可达、structured 只读、返回后最终 Prompt 来源不变', async ({ page }) => {
    await completeDeepAnalysis(page, 'editor-mode-analysis-task')

    const controls = promptControls(page)
    await expect(controls).toBeVisible({ timeout: 10000 })
    const compiled = page.getByTestId('compiled-prompt-text')
    await expect(compiled).toBeVisible()
    const compiledBefore = ((await compiled.textContent()) ?? '').trim()

    // text 模式：全文编辑器可达，初始值为当前最终 Prompt
    await controls.getByTestId('editor-mode-option-text').click()
    await expect(controls).toHaveAttribute('data-editor-mode', 'text')
    const fulltext = page.getByTestId('fulltext-prompt-editor')
    await expect(fulltext).toBeVisible()
    await expect(fulltext).toHaveValue(compiledBefore)

    // structured 模式：只读查看 + 复制；不提供可编辑的 Prompt 输入（架构 §6.2.7）
    await controls.getByTestId('editor-mode-option-structured').click()
    await expect(controls).toHaveAttribute('data-editor-mode', 'structured')
    await expect(page.getByTestId('structured-readonly-view')).toBeVisible()
    await expect(page.getByTestId('structured-readonly-copy')).toBeVisible()
    await expect(page.getByTestId('fulltext-prompt-editor')).toBeHidden()
    await expect(page.getByTestId('structured-variable-prompt')).toBeHidden()

    // 返回 variables：最终 Prompt 来源不变（structured 不改变最终 Prompt）
    await controls.getByTestId('editor-mode-option-variables').click()
    await expect(controls).toHaveAttribute('data-editor-mode', 'variables')
    await expect(compiled).toHaveText(compiledBefore)
  })

  test('TC-4.6 手动全文后切换：取消逐字保留、确认后替换并清 dirty', async ({ page }) => {
    await completeDeepAnalysis(page, 'custom-dirty-analysis-task')

    const controls = promptControls(page)
    await expect(controls).toBeVisible({ timeout: 10000 })
    await controls.getByTestId('editor-mode-option-text').click()
    const fulltext = page.getByTestId('fulltext-prompt-editor')
    await expect(fulltext).toBeVisible()
    const manualText = 'Manual full rewrite for the amber still life study.'
    await fulltext.fill(manualText)

    // customPromptDirty=true：切换 detail 先确认；取消零写入、焦点回原控件
    await controls.getByTestId('detail-option-concise').click()
    const dialog = page.getByTestId('prompt-switch-confirm-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('prompt-switch-confirm-cancel').click()
    await expect(dialog).toBeHidden()
    await expect(fulltext).toHaveValue(manualText)
    await expect(controls).toHaveAttribute('data-detail', 'standard')
    await expect(controls.getByTestId('detail-option-concise')).toBeFocused()

    // 确认切换 intent：替换为新编译文本并清除 dirty
    await controls.getByTestId('intent-option-reconstruction').click()
    await expect(page.getByTestId('prompt-switch-confirm-dialog')).toBeVisible()
    await page.getByTestId('prompt-switch-confirm-accept').click()
    await expect(page.getByTestId('prompt-switch-confirm-dialog')).toBeHidden()
    await expect(fulltext).not.toHaveValue(manualText)
    await expect(controls).toHaveAttribute('data-intent', 'reconstruction')

    // dirty 已清：再次切换 detail 即时生效，不再弹出确认
    await controls.getByTestId('detail-option-concise').click()
    await expect(page.getByTestId('prompt-switch-confirm-dialog')).toBeHidden()
    await expect(controls).toHaveAttribute('data-detail', 'concise')
  })

  test('TC-4.7 保留/改变摘要从真实规则与变量派生，点击可定位', async ({ page }) => {
    await completeDeepAnalysis(page, 'keep-change-analysis-task')

    const summary = keepChangeSummary(page)
    await expect(summary).toBeVisible({ timeout: 10000 })
    await expect(summary).toHaveAttribute('data-intent', 'same_style')

    // 默认：5 条 enabled invariants 全部进入保留项；改变项为空
    const keepItems = summary.locator('[data-testid="keep-change-item"][data-kind="keep"]')
    await expect(keepItems).toHaveCount(5)
    await expect(
      keepItems.filter({ hasText: 'warm amber and sand palette' }),
    ).toHaveCount(1)
    await expect(
      summary.locator('[data-testid="keep-change-item"][data-kind="change"]'),
    ).toHaveCount(0)

    // 点击保留项：定位 RecipeCard 中的真实规则（可追溯，不伪造）
    await keepItems.filter({ hasText: 'warm amber and sand palette' }).first().click()
    await expect(page.getByTestId('invariant-item-color_invariant_1')).toHaveAttribute(
      'data-located',
      'true',
    )

    // 修改变量：改变项出现；点击定位变量编辑器
    await promptCard(page).getByLabel('Subject').fill('ceramic vase')
    const changeItems = summary.locator(
      '[data-testid="keep-change-item"][data-kind="change"]',
    )
    await expect(changeItems).toHaveCount(1)
    await changeItems.first().click()
    await expect(promptCard(page).getByLabel('Subject')).toBeFocused()
  })

  test('TC-4.8 Recipe 无 invariants 时摘要显示可恢复空态，不伪造项', async ({ page }) => {
    await completeDeepAnalysis(
      page,
      'no-invariants-analysis-task',
      'analysis-v2-completed-no-invariants.json',
    )

    const summary = keepChangeSummary(page)
    await expect(summary).toBeVisible({ timeout: 10000 })
    await expect(summary.getByTestId('keep-change-empty')).toBeVisible()
    await expect(
      summary.locator('[data-testid="keep-change-item"][data-kind="keep"]'),
    ).toHaveCount(0)
    await expect(
      summary.locator('[data-testid="keep-change-item"][data-kind="change"]'),
    ).toHaveCount(0)

    // 无规则仍可编译最终 Prompt（不崩溃）
    await expect(page.getByTestId('compiled-prompt-text')).toBeVisible()
  })

  test('TC-4.9 画幅 reference 推荐标注，user 选择不被图片重载与 Prompt 编辑覆盖', async ({ page }) => {
    await completeDeepAnalysis(page, 'ratio-source-analysis-task')

    const dock = renderDock(page)
    const sourceBadge = dock.getByTestId('aspect-ratio-source')
    await expect(sourceBadge).toBeVisible({ timeout: 10000 })
    // 100×100 参考图（1×1 mock CDN 图）→ 最近画幅 1:1，来源 reference 且标注推荐
    await expect(sourceBadge).toHaveAttribute('data-source', 'reference')
    await expect(sourceBadge).toHaveAttribute('data-recommended', 'true')
    await expect(dock.getByLabel('Aspect Ratio')).toHaveValue('1:1')

    // 用户改选 3:4：来源切换 user
    await dock.getByLabel('Aspect Ratio').selectOption('3:4')
    await expect(sourceBadge).toHaveAttribute('data-source', 'user')
    await expect(dock.getByLabel('Aspect Ratio')).toHaveValue('3:4')

    // 图片重载（reload）不覆盖用户选择（架构 §6.3.4）
    await page.reload()
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible({
      timeout: 15000,
    })
    await expect(renderDock(page).getByTestId('aspect-ratio-source')).toHaveAttribute(
      'data-source',
      'user',
    )
    await expect(renderDock(page).getByLabel('Aspect Ratio')).toHaveValue('3:4')

    // Prompt 编辑（切换 detail）同样不覆盖
    const controls = promptControls(page)
    await expect(controls).toBeVisible({ timeout: 10000 })
    await controls.getByTestId('detail-option-concise').click()
    await expect(renderDock(page).getByLabel('Aspect Ratio')).toHaveValue('3:4')
    await expect(renderDock(page).getByTestId('aspect-ratio-source')).toHaveAttribute(
      'data-source',
      'user',
    )
  })

  test('TC-4.10 Iteration 恢复：restore 来源优先于参考推荐，旧快照降级 text 模式', async ({ page }) => {
    await seedWorkspaceV5State(page, {
      pendingIterationRestore: {
        iterationId: 'restore-iteration-id',
        promptSnapshot: 'Restored iteration full prompt snapshot',
        negativePromptSnapshot: '',
        params: { aspectRatio: '16:9', quality: 'standard' },
        analysisTaskId: 'restore-analysis-task',
        recipe: null,
        variables: [],
        sourceAssetId: 'restore-asset-id',
        sourceImageUrl: 'https://cdn.example.com/references/restore/original.png',
        sourceTemplateId: null,
        resultFileUrl: 'https://cdn.example.com/results/restore/result.webp',
      },
    })

    // 旧任务缺 promptControlSnapshot：降级 same_style/standard/text，全文取 promptSnapshot
    const controls = promptControls(page)
    await expect(controls).toBeVisible({ timeout: 10000 })
    await expect(controls).toHaveAttribute('data-editor-mode', 'text')
    const fulltext = page.getByTestId('fulltext-prompt-editor')
    await expect(fulltext).toHaveValue('Restored iteration full prompt snapshot')

    // restore 来源优先；参考图加载不覆盖（架构 §6.3.5）
    const dock = renderDock(page)
    await expect(dock.getByTestId('aspect-ratio-source')).toHaveAttribute(
      'data-source',
      'restore',
    )
    await expect(dock.getByLabel('Aspect Ratio')).toHaveValue('16:9')
  })

  test('TC-4.11 未知画幅请求前拒绝：清洗回 1:1、fallback 不标推荐、POST 仅白名单', async ({ page }) => {
    const generationTaskId = 'unknown-ratio-generation-task'
    const generation = await mockGenerationCreateCapture(page, generationTaskId)
    await mockGenerationPolling(page, generationTaskId, {
      ...loadFixture('generation-completed.json'),
      id: generationTaskId,
    })

    // 恢复态（无参考图，豁免来源图校验）携带非法画幅 21:9
    await seedWorkspaceV5State(page, {
      pendingIterationRestore: {
        iterationId: 'unknown-ratio-iteration-id',
        promptSnapshot: 'Unknown ratio restored iteration prompt',
        negativePromptSnapshot: '',
        params: { aspectRatio: '21:9', quality: 'standard' },
        analysisTaskId: 'unknown-ratio-analysis-task',
        recipe: null,
        variables: [],
        sourceAssetId: 'unknown-ratio-asset-id',
        sourceImageUrl: null,
        sourceTemplateId: null,
        resultFileUrl: null,
      },
    })

    // 未知画幅不得进入 UI：清洗回 1:1；fallback 来源且不冒充推荐
    const dock = renderDock(page)
    await expect(dock.getByLabel('Aspect Ratio')).toHaveValue('1:1')
    const sourceBadge = dock.getByTestId('aspect-ratio-source')
    await expect(sourceBadge).toBeVisible({ timeout: 10000 })
    await expect(sourceBadge).toHaveAttribute('data-source', 'fallback')
    await expect(sourceBadge).toHaveAttribute('data-recommended', 'false')

    // 请求前拒绝：readiness 拒绝（零 POST）或请求体只携带白名单画幅
    const generateButton = dock.getByRole('button', { name: /^Generate$/ })
    if (await generateButton.isDisabled()) {
      expect(generation.requests).toHaveLength(0)
    } else {
      await generateButton.click()
      await expect
        .poll(() => generation.requests.length, { timeout: 15000 })
        .toBe(1)
      const body = generation.requests[0].body as {
        params?: { aspectRatio?: string }
      }
      expect(SUPPORTED_RATIOS).toContain(body.params?.aspectRatio)
    }
  })

  test('TC-4.12 armed 期间 intent/detail 只读并说明确认快照', async ({ page }) => {
    const analysisTaskId = 'armed-prompt-controls-analysis-task'
    const generation = await mockGenerationCreateCapture(page)
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, {
      ...PROCESSING_ANALYSIS,
      id: analysisTaskId,
    })

    await chooseQuickRecreatePace(page)
    await confirmQuickRecreate(page)
    await uploadReference(page)

    await expect(page.getByTestId('quick-authorization-status')).toHaveAttribute(
      'data-authorization',
      'armed',
    )
    const controls = promptControls(page)
    await expect(controls).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('prompt-controls-locked-note')).toBeVisible()
    await expect(controls.getByTestId('intent-option-reconstruction')).toBeDisabled()
    await expect(controls.getByTestId('intent-option-same-style')).toBeDisabled()
    await expect(controls.getByTestId('detail-option-concise')).toBeDisabled()
    await expect(controls.getByTestId('detail-option-standard')).toBeDisabled()
    await expect(controls.getByTestId('detail-option-professional')).toBeDisabled()
    expect(generation.requests).toHaveLength(0)
  })
})

// ─── plan-05：本次结果区与内联比较（AC-04 / AC-05 / AC-06 / AC-07） ──────────────

/** 四类调整动作 testid 后缀（架构 §6.5.4：strengthen/relax/replace/disable） */
const ADJUSTMENT_ACTIONS = ['strengthen', 'relax', 'replace', 'disable'] as const

/** plan-04 strengthen 编译语义（`src/lib/prompt-adjustments.ts` STRENGTHEN_SUFFIX） */
const STRENGTHEN_SUFFIX = ' (严格保留)'

function directionRail(page: Page) {
  return page.getByTestId('direction-result-rail')
}

function completedRailItem(page: Page, iterationId: string) {
  return page.locator(
    `[data-testid="direction-completed-item"][data-iteration-id="${iterationId}"]`,
  )
}

function comparisonPanel(page: Page) {
  return page.getByTestId('result-comparison-panel')
}

function comparisonDimension(page: Page, dimension: string) {
  return comparisonPanel(page).locator(
    `[data-testid="comparison-dimension-option"][data-dimension="${dimension}"]`,
  )
}

function comparisonInvariant(page: Page, invariantId: string) {
  return comparisonPanel(page).locator(
    `[data-testid="comparison-invariant-option"][data-invariant-id="${invariantId}"]`,
  )
}

/** 方向结果条目 DTO（对齐架构 §7.2 DirectionIterationListItem） */
function directionItem(
  id: string,
  overrides: Partial<MockDirectionFeedItem> = {},
): MockDirectionFeedItem {
  return {
    id,
    status: 'completed',
    promptSummary: `Direction iteration ${id}`,
    resultFileUrl: `https://cdn.example.com/results/${id}/result.webp`,
    params: { aspectRatio: '1:1', quality: 'standard' },
    createdAt: '2026-09-01T00:00:00.000Z',
    resultAssetId: `asset-${id}`,
    errorMessage: null,
    ...overrides,
  }
}

/** 进行中条目（真实 feed 的 active：pending/processing，结果字段为 null） */
function activeItem(id: string, overrides: Partial<MockDirectionFeedItem> = {}) {
  return directionItem(id, {
    status: 'processing',
    resultFileUrl: null,
    resultAssetId: null,
    ...overrides,
  })
}

/** 方向累计 6 个成功结果时，服务端按 pageSize=5 契约返回的最新五条（createdAt 倒序） */
function latestFiveCompleted(): MockDirectionFeedItem[] {
  return [6, 5, 4, 3, 2].map((minute) =>
    directionItem(`dir-c-${minute}`, {
      createdAt: `2026-09-01T00:0${minute}:00.000Z`,
    }),
  )
}

/**
 * 比较所用 Iteration 详情 DTO（对齐 `MockIterationDetail` / `IterationDetail`）。
 * 历史 promptSnapshot 故意与当前草稿不同（ceramic vase vs amber bottle），
 * 驱动「展示历史上下文、调整写入当前草稿」的可观察区分（架构 §3.2 对旧结果应用调整）。
 */
function completedIterationDetail(
  id: string,
  analysisTaskId: string,
  overrides: Partial<MockIterationDetail> = {},
): MockIterationDetail {
  return {
    id,
    analysisTaskId,
    status: 'completed',
    promptSnapshot:
      'Content: ceramic vase, quiet studio table; Color: warm amber and sand palette; Lighting: soft directional window light',
    negativePromptSnapshot: 'watermark, distorted glass',
    params: { aspectRatio: '1:1', quality: 'standard' },
    modelName: 'flux.2',
    resultFileUrl: `https://cdn.example.com/results/${id}/result.webp`,
    errorMessage: null,
    recipe: null,
    recipeSource: 'missing',
    variables: [],
    variablesSource: 'missing',
    sourceImageUrl: 'https://cdn.example.com/references/mock-asset-id/original.png',
    sourceAssetId: 'mock-asset-id',
    sourceTemplateId: null,
    sourceTemplateName: null,
    savedTemplate: null,
    analysisTemplateVariables: [],
    promptControlSnapshot: {
      schemaVersion: 1,
      trigger: 'manual',
      intent: 'same_style',
      detailLevel: 'standard',
      editorMode: 'variables',
      customPromptDirty: false,
      enabledInvariantIds: [
        'color_invariant_1',
        'lighting_invariant_1',
        'visual_medium_invariant_1',
        'material_texture_invariant_1',
        'atmosphere_invariant_1',
      ],
      variableValues: { subject: 'ceramic vase', environment: 'quiet studio table' },
      enabledModifierNames: [],
      modifierValues: {},
      adjustments: [],
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

/** plan-05 共享：seed 方向 feed 与所选结果详情，打开内联比较并等待就绪 */
async function openComparison(
  page: Page,
  options: {
    analysisTaskId: string
    iterationId: string
    detail?: Partial<MockIterationDetail>
    analysisFixture?: string
  },
) {
  await mockDirectionFeedStateful(page, {
    completed: [directionItem(options.iterationId)],
    active: null,
    latestFailure: null,
  })
  await mockIterationDetailStateful(
    page,
    completedIterationDetail(options.iterationId, options.analysisTaskId, options.detail),
  )
  await completeDeepAnalysis(page, options.analysisTaskId, options.analysisFixture)

  const rail = directionRail(page)
  await expect(rail).toBeVisible({ timeout: 10000 })
  await completedRailItem(page, options.iterationId)
    .getByTestId('direction-item-compare')
    .click()

  const panel = comparisonPanel(page)
  await expect(panel).toBeVisible({ timeout: 10000 })
  // 打开比较聚焦标题（内联 focus-managed region，不 trap；架构 ADR-7）
  await expect(panel.getByTestId('comparison-panel-title')).toBeFocused()
  return panel
}

test.describe('plan-05：本次结果区与内联比较（AC-04 / AC-05 / AC-06 / AC-07）', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
    await gotoWorkspace(page)
  })

  test('TC-5.1 方向结果区三组状态同时内联呈现，active/latestFailure 不挤占五张成功缩略图', async ({ page }) => {
    const queries: DirectionFeedRequestQuery[] = []
    const active = activeItem('dir-active-1', { createdAt: '2026-09-01T00:07:00.000Z' })
    const failure = directionItem('dir-fail-1', {
      status: 'failed',
      resultFileUrl: null,
      resultAssetId: null,
      errorMessage: 'Provider model timeout',
      createdAt: '2026-09-01T00:05:30.000Z',
    })
    await mockDirectionFeedStateful(
      page,
      { completed: latestFiveCompleted(), active, latestFailure: failure },
      { onRequest: (query) => queries.push(query) },
    )

    await completeDeepAnalysis(page, 'rail-states-analysis-task')

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })

    // 五张真实成功缩略图（AC-04：最近五个成功结果）
    await expect(rail.getByTestId('direction-completed-item')).toHaveCount(5)
    await expect(completedRailItem(page, 'dir-c-6').locator('img')).toBeVisible()

    // active 独立呈现，不占用五条 completed 名额（ADR-5：三组不共享配额）
    const activeFace = rail.getByTestId('direction-active-face')
    await expect(activeFace).toBeVisible()
    await expect(activeFace).toHaveAttribute('data-iteration-id', 'dir-active-1')

    // 最近失败独立呈现：截断原因 + 主动重试入口
    const failureFace = rail.getByTestId('direction-failure-face')
    await expect(failureFace).toBeVisible()
    await expect(failureFace).toHaveAttribute('data-iteration-id', 'dir-fail-1')
    await expect(failureFace.getByText('Provider model timeout')).toBeVisible()
    await expect(rail.getByTestId('direction-failure-retry')).toBeVisible()

    // 三组并存时缩略图数量不变（active/failure 不挤占）
    await expect(rail.getByTestId('direction-completed-item')).toHaveCount(5)

    // 方向 query 契约：view=direction + 当前 analysisTaskId + pageSize=5
    await expect.poll(() => queries.length).toBeGreaterThan(0)
    expect(queries[0].view).toBe('direction')
    expect(queries[0].analysisTaskId).toBe('rail-states-analysis-task')
    expect(queries[0].pageSize).toBe(5)
  })

  test('TC-5.2 手动生成 queue→processing→success 全程内联：新成功自动成为当前选择且不自动成为本次首选', async ({ page }) => {
    const priorCompleted = directionItem('dir-c-old', {
      createdAt: '2026-09-01T00:01:00.000Z',
    })
    const feed = await mockDirectionFeedStateful(page, {
      completed: [priorCompleted],
      active: null,
      latestFailure: null,
    })
    const generationTaskId = 'dir-new-generation-task'
    const generation = await mockGenerationCreateCapture(page, generationTaskId)
    await mockGenerationPolling(page, generationTaskId, {
      ...loadFixture('generation-completed.json'),
      id: generationTaskId,
      status: 'processing',
      resultAssetId: null,
      resultFileUrl: null,
    })

    await completeDeepAnalysis(page, 'inline-lifecycle-analysis-task')

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    await expect(rail.getByTestId('direction-completed-item')).toHaveCount(1)

    // 先推进服务端事实：POST 后的下一次 feed 刷新将看到 active
    const newItem = directionItem(generationTaskId, {
      createdAt: '2026-09-01T00:09:00.000Z',
    })
    feed.set({
      completed: [priorCompleted],
      active: activeItem(generationTaskId, { createdAt: '2026-09-01T00:08:00.000Z' }),
      latestFailure: null,
    })

    // 手动生成：queue/processing 直接进入本次结果区（AC-04 全状态内联）
    await renderDock(page).getByRole('button', { name: /^Generate$/ }).click()
    await expect
      .poll(() => generation.requests.length, { timeout: 15000 })
      .toBe(1)
    expect(
      (generation.requests[0].body as { analysisTaskId?: unknown }).analysisTaskId,
    ).toBe('inline-lifecycle-analysis-task')

    const activeFace = rail.getByTestId('direction-active-face')
    await expect(activeFace).toBeVisible({ timeout: 15000 })
    await expect(activeFace).toHaveAttribute('data-iteration-id', generationTaskId)

    // 终态：active 清空，新成功进入 completed 最新位（AC-04 第六个成功前的正常窗口）
    feed.set({ completed: [newItem, priorCompleted], active: null, latestFailure: null })
    const newItemFace = completedRailItem(page, generationTaskId)
    await expect(newItemFace).toBeVisible({ timeout: 15000 })
    await expect(rail.getByTestId('direction-completed-item')).toHaveCount(2)

    // 新成功自动成为瞬时当前选择（架构 §6.4.7）
    await expect(newItemFace).toHaveAttribute('data-selected', 'true')
    await expect(rail).toHaveAttribute('data-selected-id', generationTaskId)

    // selected/preferred 分离：新成功绝不自动成为本次首选（AC-06）
    await expect(newItemFace).toHaveAttribute('data-preferred', 'false')
    await expect(rail).toHaveAttribute('data-preferred-id', '')
    expect(generation.requests).toHaveLength(1)
  })

  test('TC-5.3 六个成功结果只显示最新五个，更旧结果仍可打开完整 Iteration', async ({ page }) => {
    const queries: DirectionFeedRequestQuery[] = []
    // 方向累计 6 个成功：服务端按 pageSize=5 契约只返回最新五条（dir-c-1 最旧，留在 Iteration Memory）
    await mockDirectionFeedStateful(
      page,
      { completed: latestFiveCompleted(), active: null, latestFailure: null },
      { onRequest: (query) => queries.push(query) },
    )

    await completeDeepAnalysis(page, 'six-completed-analysis-task')

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    const thumbs = rail.getByTestId('direction-completed-item')
    await expect(thumbs).toHaveCount(5)

    // 第六个（最旧）成功结果不进入首屏缩略图
    await expect(completedRailItem(page, 'dir-c-1')).toHaveCount(0)

    // 旧结果仍可通过「打开完整 Iteration」到达（Iteration Memory 是完整历史）
    await expect(
      thumbs.first().getByTestId('direction-item-open-iteration'),
    ).toBeVisible()

    await expect.poll(() => queries.length).toBeGreaterThan(0)
    expect(queries[0].pageSize).toBe(5)
  })

  test('TC-5.4 最近失败内联显示截断原因，主动重试创建新任务且不复活原任务', async ({ page }) => {
    const failure = directionItem('dir-fail-retry', {
      status: 'failed',
      resultFileUrl: null,
      resultAssetId: null,
      errorMessage: 'Image provider rejected the request after 3 attempts',
      createdAt: '2026-09-01T00:05:00.000Z',
    })
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: failure,
    })
    const generation = await mockGenerationCreateCapture(page, 'dir-retry-new-task')
    await mockGenerationPolling(page, 'dir-retry-new-task', {
      ...loadFixture('generation-completed.json'),
      id: 'dir-retry-new-task',
      status: 'processing',
      resultAssetId: null,
      resultFileUrl: null,
    })

    await completeDeepAnalysis(page, 'failure-retry-analysis-task')

    const rail = directionRail(page)
    const failureFace = rail.getByTestId('direction-failure-face')
    await expect(failureFace).toBeVisible({ timeout: 10000 })
    await expect(failureFace.getByText(/Image provider rejected/)).toBeVisible()

    // 先推进服务端事实，再触发主动重试：POST 后的 feed 刷新将看到新 active
    feed.set({
      completed: [],
      active: activeItem('dir-retry-new-task', { createdAt: '2026-09-01T00:06:00.000Z' }),
      latestFailure: failure,
    })
    await rail.getByTestId('direction-failure-retry').click()
    await expect
      .poll(() => generation.requests.length, { timeout: 15000 })
      .toBe(1)
    expect(
      (generation.requests[0].body as { analysisTaskId?: unknown }).analysisTaskId,
    ).toBe('failure-retry-analysis-task')

    // 重试创建新的 GenerationTask（active face 是新 id），原任务保持 failed 终态不复活
    const activeFace = rail.getByTestId('direction-active-face')
    await expect(activeFace).toBeVisible({ timeout: 15000 })
    await expect(activeFace).toHaveAttribute('data-iteration-id', 'dir-retry-new-task')
    await expect(rail.getByTestId('direction-failure-face')).toHaveAttribute(
      'data-iteration-id',
      'dir-fail-retry',
    )
    expect(generation.requests).toHaveLength(1)
  })

  test('TC-5.5 当前选择与本次首选分离：首选只由用户操作写入且状态标识不同', async ({ page }) => {
    const c1 = directionItem('dir-pref-c1', { createdAt: '2026-09-01T00:01:00.000Z' })
    const c2 = directionItem('dir-pref-c2', { createdAt: '2026-09-01T00:02:00.000Z' })
    await mockDirectionFeedStateful(page, {
      completed: [c2, c1],
      active: null,
      latestFailure: null,
    })

    await completeDeepAnalysis(page, 'selected-preferred-analysis-task')

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })

    // 初始：无首选，两项均非首选（preferred 不随渲染自动产生）
    await expect(rail).toHaveAttribute('data-preferred-id', '')
    await expect(completedRailItem(page, 'dir-pref-c1')).toHaveAttribute(
      'data-preferred',
      'false',
    )

    // 用户显式设置 c1 为本次首选（aria-pressed 表达首选状态）
    const preferredButton = completedRailItem(page, 'dir-pref-c1').getByTestId(
      'direction-item-preferred',
    )
    await expect(preferredButton).toHaveAttribute('aria-pressed', 'false')
    await preferredButton.click()
    await expect(preferredButton).toHaveAttribute('aria-pressed', 'true')
    await expect(completedRailItem(page, 'dir-pref-c1')).toHaveAttribute(
      'data-preferred',
      'true',
    )
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-pref-c1')

    // 切换当前选择到 c2：selected 变化，preferred 不跟随（两者独立，文案/状态不同）
    await completedRailItem(page, 'dir-pref-c2').click()
    await expect(completedRailItem(page, 'dir-pref-c2')).toHaveAttribute(
      'data-selected',
      'true',
    )
    await expect(completedRailItem(page, 'dir-pref-c1')).toHaveAttribute(
      'data-selected',
      'false',
    )
    await expect(completedRailItem(page, 'dir-pref-c1')).toHaveAttribute(
      'data-preferred',
      'true',
    )
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-pref-c1')
  })

  test('TC-5.6 打开比较：加载所选 Iteration、真实双图、历史快照与「正在调整当前草稿」，标题获得焦点', async ({ page }) => {
    const panel = await openComparison(page, {
      analysisTaskId: 'compare-open-analysis-task',
      iterationId: 'dir-compare-1',
    })

    // 真实双图：参考与结果都来自所选 Iteration 的真实 URL（不显示占位假图）
    await expect(panel.getByTestId('comparison-reference-image')).toHaveAttribute(
      'src',
      /cdn\.example\.com\/references\/mock-asset-id\/original\.png/,
    )
    await expect(panel.getByTestId('comparison-result-image')).toHaveAttribute(
      'src',
      /cdn\.example\.com\/results\/dir-compare-1\/result\.webp/,
    )

    // 该结果历史 Prompt 快照可见，且调整目标明确是当前草稿（历史 ≠ 当前）
    await expect(panel.getByTestId('comparison-historical-prompt')).toContainText(
      'ceramic vase',
    )
    await expect(panel.getByTestId('comparison-historical-context')).toBeVisible()
    await expect(page.getByTestId('compiled-prompt-text')).toContainText('amber bottle')

    // 状态通知使用 polite live region，不夺焦点
    await expect(panel.getByTestId('comparison-live-region')).toHaveAttribute(
      'aria-live',
      'polite',
    )
  })

  test('TC-5.7 多 invariant 维度：未选具体规则前四动作 disabled，选择真实规则后开放', async ({ page }) => {
    const panel = await openComparison(page, {
      analysisTaskId: 'multi-invariant-analysis-task',
      iterationId: 'dir-multi-1',
      analysisFixture: 'analysis-v2-completed-dual-invariant.json',
    })

    // 选择 color 维度（当前 Recipe 有 2 条真实 invariant）
    await comparisonDimension(page, 'color').click()

    // 该维度全部真实 invariants 与 observations 呈现（真实证据，不自动偏差结论）
    await expect(panel.getByTestId('comparison-invariant-option')).toHaveCount(2)
    await expect(comparisonInvariant(page, 'color_invariant_1')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(comparisonInvariant(page, 'color_invariant_2')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(
      panel
        .getByTestId('comparison-observation-item')
        .filter({ hasText: 'warm amber and sand palette' }),
    ).toBeVisible()
    await expect(panel.getByTestId('comparison-prompt-segments')).toContainText(
      'warm amber and sand palette',
    )

    // 多条规则未选目标：四类动作全部 disabled（架构 §6.5.3）
    for (const action of ADJUSTMENT_ACTIONS) {
      await expect(panel.getByTestId(`adjustment-action-${action}`)).toBeDisabled()
    }

    // 明确选择具体真实规则后四动作开放
    await comparisonInvariant(page, 'color_invariant_2').click()
    await expect(comparisonInvariant(page, 'color_invariant_2')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    for (const action of ADJUSTMENT_ACTIONS) {
      await expect(panel.getByTestId(`adjustment-action-${action}`)).toBeEnabled()
    }
  })

  test('TC-5.8 单 invariant 维度：唯一规则可见地预选，四动作直接可用', async ({ page }) => {
    const panel = await openComparison(page, {
      analysisTaskId: 'single-invariant-analysis-task',
      iterationId: 'dir-single-1',
    })

    await comparisonDimension(page, 'lighting').click()

    // 恰有一条 invariant：可见地预选（aria-pressed=true，不隐藏选择事实）
    await expect(panel.getByTestId('comparison-invariant-option')).toHaveCount(1)
    const invariant = comparisonInvariant(page, 'lighting_invariant_1')
    await expect(invariant).toBeVisible()
    await expect(invariant).toHaveAttribute('aria-pressed', 'true')

    // 四类动作直接可用
    for (const action of ADJUSTMENT_ACTIONS) {
      await expect(panel.getByTestId(`adjustment-action-${action}`)).toBeEnabled()
    }
  })

  test('TC-5.9 零 invariant 维度：提示暂无可调整规则，四动作 disabled，仅保留「其他/全文编辑」', async ({ page }) => {
    const panel = await openComparison(page, {
      analysisTaskId: 'zero-invariant-analysis-task',
      iterationId: 'dir-zero-1',
    })

    // composition 维度有 observation（composition_1）但无 invariant 覆盖
    await comparisonDimension(page, 'composition').click()

    await expect(panel.getByTestId('comparison-invariant-empty')).toBeVisible()
    await expect(panel.getByTestId('comparison-invariant-empty')).toContainText(
      '暂无可调整规则',
    )
    await expect(panel.getByTestId('comparison-invariant-option')).toHaveCount(0)

    // 真实 observation 仍展示，但不得伪造 invariant 或 adjustment
    await expect(
      panel
        .getByTestId('comparison-observation-item')
        .filter({ hasText: 'asymmetric thirds composition' }),
    ).toBeVisible()
    for (const action of ADJUSTMENT_ACTIONS) {
      await expect(panel.getByTestId(`adjustment-action-${action}`)).toBeDisabled()
    }

    // 只保留「其他/全文编辑」入口
    await expect(panel.getByTestId('comparison-dimension-other')).toBeEnabled()
  })

  test('TC-5.10 应用调整只更新当前草稿：重编译出现加强表达、焦点移至摘要项且零 generation POST', async ({ page }) => {
    const generation = await mockGenerationCreateCapture(page)
    const panel = await openComparison(page, {
      analysisTaskId: 'apply-adjustment-analysis-task',
      iterationId: 'dir-apply-1',
    })

    // color 维度恰有一条 invariant（可见预选），选择 strengthen 后应用
    await comparisonDimension(page, 'color').click()
    await expect(comparisonInvariant(page, 'color_invariant_1')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await panel.getByTestId('adjustment-action-strengthen').click()
    await panel.getByTestId('comparison-adjustment-apply').click()

    // 应用后面板关闭，草稿按所选 invariantId 重编译（plan-04 确定文案语义）
    await expect(panel).toBeHidden()
    await expect(page.getByTestId('compiled-prompt-text')).toContainText(
      `warm amber and sand palette${STRENGTHEN_SUFFIX}`,
    )

    // 焦点移动到更新的「保留 / 改变」摘要项（plan-04 keep-change-item data-target-id）
    await expect(
      page.locator('[data-testid="keep-change-item"][data-target-id="color_invariant_1"]'),
    ).toBeFocused()

    // 应用不自动生成（AC-05：生成仍需主动确认）
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-5.11 取消比较零写入：草稿逐字不变、面板关闭、焦点回比较触发器', async ({ page }) => {
    const generation = await mockGenerationCreateCapture(page)
    const panel = await openComparison(page, {
      analysisTaskId: 'cancel-adjustment-analysis-task',
      iterationId: 'dir-cancel-1',
    })

    const compiled = page.getByTestId('compiled-prompt-text')
    const compiledBefore = ((await compiled.textContent()) ?? '').trim()

    // 选择维度与动作但不应用，直接取消
    await comparisonDimension(page, 'lighting').click()
    await panel.getByTestId('adjustment-action-relax').click()
    await panel.getByTestId('comparison-adjustment-cancel').click()

    await expect(panel).toBeHidden()
    // 焦点返回原结果的比较按钮（触发器）
    await expect(
      completedRailItem(page, 'dir-cancel-1').getByTestId('direction-item-compare'),
    ).toBeFocused()
    // 取消零写入：草稿逐字不变
    await expect(compiled).toHaveText(compiledBefore)
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-5.12 「其他」维度进入全文编辑：编辑方式切 text 并聚焦全文编辑器', async ({ page }) => {
    const generation = await mockGenerationCreateCapture(page)
    const panel = await openComparison(page, {
      analysisTaskId: 'other-dimension-analysis-task',
      iterationId: 'dir-other-1',
    })

    // 「其他」直接聚焦全文编辑（架构 §6.5.2），不创建 adjustment
    await panel.getByTestId('comparison-dimension-other').click()

    await expect(promptControls(page)).toHaveAttribute('data-editor-mode', 'text')
    await expect(page.getByTestId('fulltext-prompt-editor')).toBeFocused()
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-5.13 方向 feed 失败保留缓存与草稿并提供重试，重试后恢复', async ({ page }) => {
    const c1 = directionItem('dir-feed-c1', { createdAt: '2026-09-01T00:01:00.000Z' })
    const c2 = directionItem('dir-feed-c2', { createdAt: '2026-09-01T00:02:00.000Z' })
    const feed = await mockDirectionFeedStateful(page, {
      completed: [c2, c1],
      active: activeItem('dir-feed-active', { createdAt: '2026-09-01T00:03:00.000Z' }),
      latestFailure: null,
    })

    await completeDeepAnalysis(page, 'feed-failure-analysis-task')

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    await expect(rail.getByTestId('direction-completed-item')).toHaveCount(2)
    const compiled = page.getByTestId('compiled-prompt-text')
    const compiledBefore = ((await compiled.textContent()) ?? '').trim()

    // L2：方向列表失败不清空缓存与草稿（active 期间的定时刷新命中 503）
    feed.fail()
    await expect(rail.getByTestId('direction-feed-error')).toBeVisible({ timeout: 15000 })
    await expect(rail.getByTestId('direction-completed-item')).toHaveCount(2)
    await expect(rail.getByTestId('direction-feed-retry')).toBeVisible()
    await expect(compiled).toHaveText(compiledBefore)

    // 主动重试恢复：feed 返回新事实（第三条成功），缓存更新且错误态消失
    feed.set({
      completed: [
        directionItem('dir-feed-c3', { createdAt: '2026-09-01T00:04:00.000Z' }),
        c2,
        c1,
      ],
      active: null,
      latestFailure: null,
    })
    await rail.getByTestId('direction-feed-retry').click()
    await expect(completedRailItem(page, 'dir-feed-c3')).toBeVisible({ timeout: 15000 })
    await expect(rail.getByTestId('direction-feed-error')).toBeHidden()
  })

  test('TC-5.14 比较详情失败保留结果区与草稿，提供重试与打开 Iteration，重试后恢复', async ({ page }) => {
    const analysisTaskId = 'detail-failure-analysis-task'
    const detail = completedIterationDetail('dir-detail-fail-1', analysisTaskId)
    await mockDirectionFeedStateful(page, {
      completed: [directionItem('dir-detail-fail-1')],
      active: null,
      latestFailure: null,
    })
    const detailMock = await mockIterationDetailStateful(page, detail)
    detailMock.fail()

    await completeDeepAnalysis(page, analysisTaskId)

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    const compiled = page.getByTestId('compiled-prompt-text')
    const compiledBefore = ((await compiled.textContent()) ?? '').trim()

    await completedRailItem(page, 'dir-detail-fail-1')
      .getByTestId('direction-item-compare')
      .click()
    const panel = comparisonPanel(page)
    await expect(panel).toBeVisible({ timeout: 10000 })

    // 详情失败：真实错误态 + 重试 + 打开 Iteration 动作；结果区与草稿保留
    const detailError = panel.getByTestId('comparison-detail-error')
    await expect(detailError).toBeVisible({ timeout: 15000 })
    await expect(detailError.getByTestId('comparison-detail-retry')).toBeVisible()
    await expect(detailError.getByTestId('comparison-detail-open-iteration')).toBeVisible()
    await expect(rail.getByTestId('direction-completed-item')).toHaveCount(1)
    await expect(compiled).toHaveText(compiledBefore)

    // 重试恢复后比较正常渲染真实双图
    detailMock.set(detail)
    await detailError.getByTestId('comparison-detail-retry').click()
    await expect(panel.getByTestId('comparison-result-image')).toBeVisible({
      timeout: 15000,
    })
  })

  test('TC-5.15 completed 缺结果资产：显示来源异常，不渲染假图且不开放结果动作', async ({ page }) => {
    const okItem = directionItem('dir-asset-ok', { createdAt: '2026-09-01T00:02:00.000Z' })
    const missingItem = directionItem('dir-asset-missing', {
      resultFileUrl: null,
      resultAssetId: null,
      createdAt: '2026-09-01T00:01:00.000Z',
    })
    await mockDirectionFeedStateful(page, {
      completed: [okItem, missingItem],
      active: null,
      latestFailure: null,
    })

    await completeDeepAnalysis(page, 'missing-asset-analysis-task')

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })

    // 正常条目渲染真实图片；缺资产条目显示来源异常标记
    await expect(completedRailItem(page, 'dir-asset-ok').locator('img')).toBeVisible()
    const missing = completedRailItem(page, 'dir-asset-missing')
    await expect(missing).toBeVisible()
    await expect(missing).toHaveAttribute('data-asset-missing', 'true')

    // 不渲染假图；比较/首选等结果动作不开放（架构 §7.4：completed 必须有 resultAssetId）
    await expect(missing.locator('img')).toHaveCount(0)
    await expect(missing.getByTestId('direction-item-compare')).toBeDisabled()
    await expect(missing.getByTestId('direction-item-preferred')).toBeDisabled()
  })
})

// ─── plan-06：首选 Memory 与结果新参考（AC-04 / AC-06 / AC-07） ──────────────

function saveMemoryDialog(page: Page) {
  return page.getByTestId('save-style-memory-dialog')
}

/** plan-06 契约：来源 Memory 的轻量代表结果确认容器（复用 RepresentativeResultSelector） */
function representativeSelector(page: Page) {
  return page.getByTestId('representative-result-selector')
}

/** plan-06 契约：工作区当前来源 Memory 的验证状态位（服务端派生，禁止乐观伪造） */
function memoryStatus(page: Page) {
  return page.getByTestId('direction-memory-status')
}

/** plan-06 契约：作为新参考的方向切换守卫确认（复用 replace-confirm 骨架） */
function newReferenceDialog(page: Page) {
  return page.getByTestId('new-reference-confirm-dialog')
}

/** plan-06: 来源 Memory 详情 DTO（pending 起步、无代表结果） */
function sourceMemoryDetail(
  id: string,
  overrides: Partial<MockStyleMemoryDetail> = {},
): MockStyleMemoryDetail {
  return {
    id,
    name: 'Direction source memory',
    description: null,
    content: 'Create {{subject}} in the saved direction style.',
    variables: [{ name: 'subject', defaultValue: 'amber bottle' }],
    retainedRules: ['warm amber and sand palette'],
    negativeConstraints: [],
    styleTokens: ['editorial soft light'],
    enhancementHints: [],
    verificationStatus: 'pending_verification',
    representativeGenerationTaskId: null,
    sourceAssetId: 'mock-asset-id',
    sourceImageUrl: 'https://cdn.example.com/references/mock-asset-id/original.png',
    sourceGenerationTaskId: null,
    sourceGenerationTask: null,
    representativeResult: null,
    usage: { lastUsedAt: null, derivedIterationCount: 0 },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

/** plan-06: 代表结果候选条目（promptSummary 携带 id，驱动 radio 可访问名定位） */
function representativeCandidate(id: string): MockRepresentativeCandidate {
  return {
    id,
    imageUrl: `https://cdn.example.com/results/${id}/result.webp`,
    promptSummary: `Preferred direction result ${id}`,
    createdAt: '2026-09-01T00:03:00.000Z',
  }
}

/**
 * plan-06 共享：以「来自来源 Memory 的方向恢复」挂载工作台
 * （currentTemplateId=templateId）。走 plan-04 的 pendingIterationRestore
 * 一次性通道（TC-4.10 同模式）：挂载消费后 currentTemplateId 固化，且
 * sourceImageUrl=null 保持上传入口可用，供 completeDeepAnalysis 建立当前方向。
 */
async function seedSourceMemoryDirection(page: Page, templateId = 'tpl-src-1') {
  await seedWorkspaceV5State(page, {
    pendingIterationRestore: {
      iterationId: 'seed-source-iteration',
      promptSnapshot: 'Seeded from the source style memory direction',
      negativePromptSnapshot: '',
      params: { aspectRatio: '1:1', quality: 'standard' },
      analysisTaskId: 'seed-source-analysis-task',
      recipe: null,
      variables: [],
      sourceAssetId: null,
      sourceImageUrl: null,
      sourceTemplateId: templateId,
      resultFileUrl: null,
    },
  })
}

test.describe('plan-06：首选 Memory 与结果新参考（AC-04 / AC-06 / AC-07）', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
    await gotoWorkspace(page)
  })

  test('TC-6.1 设置与更换首选：preferred 写入经 Iteration detail 验证，更换后指向新结果', async ({ page }) => {
    const analysisTaskId = 'preferred-validate-analysis-task'
    const c1 = directionItem('dir-pref-v1', { createdAt: '2026-09-01T00:01:00.000Z' })
    const c2 = directionItem('dir-pref-v2', { createdAt: '2026-09-01T00:02:00.000Z' })
    await mockDirectionFeedStateful(page, {
      completed: [c2, c1],
      active: null,
      latestFailure: null,
    })
    const detailV1 = await mockIterationDetailSequence(page, 'dir-pref-v1', [
      completedIterationDetail('dir-pref-v1', analysisTaskId),
    ])
    const detailV2 = await mockIterationDetailSequence(page, 'dir-pref-v2', [
      completedIterationDetail('dir-pref-v2', analysisTaskId),
    ])

    await completeDeepAnalysis(page, analysisTaskId)

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })

    // 设置首选 c1：preferred 写入伴随该结果的 Iteration detail 验证（架构 §6.7.1）
    await completedRailItem(page, 'dir-pref-v1').getByTestId('direction-item-preferred').click()
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-pref-v1')
    await expect.poll(() => detailV1.callCount, { timeout: 10000 }).toBeGreaterThan(0)

    // 更换首选到 c2：preferred 指向新结果并同样经验证，c1 不再是首选
    await completedRailItem(page, 'dir-pref-v2').getByTestId('direction-item-preferred').click()
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-pref-v2')
    await expect(completedRailItem(page, 'dir-pref-v1')).toHaveAttribute('data-preferred', 'false')
    await expect(completedRailItem(page, 'dir-pref-v2')).toHaveAttribute('data-preferred', 'true')
    await expect.poll(() => detailV2.callCount, { timeout: 10000 }).toBeGreaterThan(0)
  })

  test('TC-6.2 首选滚出五条成功窗口仍有效：「首选已在 Iteration Memory」提示并可打开详情', async ({ page }) => {
    const analysisTaskId = 'preferred-external-analysis-task'
    const preferredOld = directionItem('dir-pref-old', {
      createdAt: '2026-09-01T00:00:30.000Z',
    })
    // active 存在 → 方向 feed 按 2-3s 节奏定时刷新（架构 §6.4.5）
    const feed = await mockDirectionFeedStateful(page, {
      completed: [preferredOld],
      active: activeItem('dir-pref-roll-active', { createdAt: '2026-09-01T00:01:00.000Z' }),
      latestFailure: null,
    })
    await mockIterationDetailSequence(page, 'dir-pref-old', [
      completedIterationDetail('dir-pref-old', analysisTaskId),
    ])

    await completeDeepAnalysis(page, analysisTaskId)

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    await completedRailItem(page, 'dir-pref-old').getByTestId('direction-item-preferred').click()
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-pref-old')

    // 方向新任务完成 + 累计 6 个成功：服务端只返回最新五条，preferred 滚出窗口
    //（feed 的下一次定时刷新读到新事实：active 清空、preferred 不在五条内）
    feed.set({ completed: latestFiveCompleted(), active: null, latestFailure: null })
    await expect(rail.getByTestId('direction-completed-item')).toHaveCount(5, {
      timeout: 15000,
    })
    await expect(completedRailItem(page, 'dir-pref-old')).toHaveCount(0)

    // detail 仍有效（同方向、completed、有资产）→ 保留 ID + 提示 + 打开详情动作（AC-06）
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-pref-old')
    const external = rail.getByTestId('direction-preferred-external')
    await expect(external).toBeVisible({ timeout: 10000 })
    await expect(external).toHaveAttribute('data-iteration-id', 'dir-pref-old')
    await rail.getByTestId('direction-preferred-open-detail').click()
    await expect(page).toHaveURL(/\/workspace\/iterations/)
  })

  test('TC-6.3 无效 preferred 清理：detail 属不同方向时清除 ID 并说明原因', async ({ page }) => {
    const analysisTaskId = 'invalid-preferred-analysis-task'
    await mockDirectionFeedStateful(page, {
      completed: [directionItem('dir-pref-bad')],
      active: null,
      latestFailure: null,
    })
    // feed 中该条 completed 且带资产，但其 Iteration detail 属于另一方向 → 验证无效
    await mockIterationDetailSequence(page, 'dir-pref-bad', [
      completedIterationDetail('dir-pref-bad', 'other-direction-analysis-task'),
    ])

    await completeDeepAnalysis(page, analysisTaskId)

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })

    // 用户尝试设置首选：detail 验证发现不同方向 → 清除 ID 并说明无效原因（AC-06）
    await completedRailItem(page, 'dir-pref-bad').getByTestId('direction-item-preferred').click()
    await expect(rail).toHaveAttribute('data-preferred-id', '')
    const invalid = rail.getByTestId('direction-preferred-invalid')
    await expect(invalid).toBeVisible({ timeout: 10000 })
    await expect(invalid).toHaveAttribute('data-iteration-id', 'dir-pref-bad')
    // 无效首选不呈现「窗口外仍有效」提示（区分两种出口）
    await expect(rail.getByTestId('direction-preferred-external')).toHaveCount(0)
  })

  test('TC-6.4 无来源 Memory：从首选结果打开保存向导并预选代表结果；取消零写入', async ({ page }) => {
    const analysisTaskId = 'memory-create-analysis-task'
    await mockDirectionFeedStateful(page, {
      completed: [directionItem('dir-save-1')],
      active: null,
      latestFailure: null,
    })
    await mockIterationDetailSequence(page, 'dir-save-1', [
      completedIterationDetail('dir-save-1', analysisTaskId),
    ])
    const templates = await mockTemplateCreateCapture(page)

    await completeDeepAnalysis(page, analysisTaskId)

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    await completedRailItem(page, 'dir-save-1').getByTestId('direction-item-preferred').click()
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-save-1')

    // 无 currentTemplateId：Memory 动作打开既有 SaveStyleMemoryDialog，预选该完成结果为代表结果
    await completedRailItem(page, 'dir-save-1').getByTestId('direction-item-save-memory').click()
    const dialog = saveMemoryDialog(page)
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await expect(
      dialog.getByRole('checkbox', { name: /Set as representative result/ }),
    ).toBeChecked()

    // 取消零写入：不发任何 Memory create 请求
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(templates.requests).toHaveLength(0)

    // 重新打开并完成保存：create 请求携带来源迭代与预选代表结果（第 14 期请求契约）
    await completedRailItem(page, 'dir-save-1').getByTestId('direction-item-save-memory').click()
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await dialog.getByRole('button', { name: /^Next$/ }).click()
    await dialog.getByRole('button', { name: /^Next$/ }).click()
    await dialog.getByRole('textbox', { name: /^name/i }).first().fill('Preferred direction memory')
    await dialog.getByRole('button', { name: /^Sav/ }).click()
    await expect.poll(() => templates.requests.length, { timeout: 15000 }).toBe(1)
    const body = templates.requests[0].body as Record<string, unknown>
    expect(body.sourceGenerationTaskId).toBe('dir-save-1')
    expect(body.representativeGenerationTaskId).toBe('dir-save-1')
  })

  test('TC-6.5 有来源 Memory：Memory 动作打开代表结果确认并预选 preferred 结果', async ({ page }) => {
    const analysisTaskId = 'memory-update-analysis-task'
    await seedSourceMemoryDirection(page)
    const collection = await mockStyleMemoryDetailCollection(
      page,
      [sourceMemoryDetail('tpl-src-1')],
      { candidates: { 'tpl-src-1': [representativeCandidate('dir-rep-1')] } },
    )
    await mockDirectionFeedStateful(page, {
      completed: [directionItem('dir-rep-1')],
      active: null,
      latestFailure: null,
    })
    await mockIterationDetailSequence(page, 'dir-rep-1', [
      completedIterationDetail('dir-rep-1', analysisTaskId),
    ])

    await completeDeepAnalysis(page, analysisTaskId)

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    // 当前来源 Memory 验证状态由服务端详情派生（未确认前为 pending）
    await expect(memoryStatus(page)).toHaveAttribute(
      'data-verification',
      'pending_verification',
      { timeout: 10000 },
    )

    await completedRailItem(page, 'dir-rep-1').getByTestId('direction-item-preferred').click()
    await completedRailItem(page, 'dir-rep-1').getByTestId('direction-item-save-memory').click()

    // 轻量代表结果确认（复用 RepresentativeResultSelector）：preferred 结果已预选
    const selector = representativeSelector(page)
    await expect(selector).toBeVisible({ timeout: 10000 })
    await expect(selector.getByRole('radio', { name: /dir-rep-1/ })).toBeChecked()

    // 确认后才更新（架构 §6.7.2）：POST 只在确认点击后发出，命中既有 representative-result 端点
    await selector.getByRole('button', { name: /Set as representative/ }).click()
    await expect
      .poll(() => collection.representativeResultRequests.length, { timeout: 15000 })
      .toBe(1)
    expect(collection.representativeResultRequests[0].id).toBe('tpl-src-1')
    expect(collection.representativeResultRequests[0].body.generationTaskId).toBe('dir-rep-1')
  })

  test('TC-6.6 Memory 更新成功后四类回读即时可见，无需整页刷新', async ({ page }) => {
    const analysisTaskId = 'memory-refresh-analysis-task'
    const feedQueries: DirectionFeedRequestQuery[] = []
    await seedSourceMemoryDirection(page)
    const collection = await mockStyleMemoryDetailCollection(
      page,
      [sourceMemoryDetail('tpl-src-1')],
      { candidates: { 'tpl-src-1': [representativeCandidate('dir-rep-1')] } },
    )
    await mockDirectionFeedStateful(
      page,
      { completed: [directionItem('dir-rep-1')], active: null, latestFailure: null },
      { onRequest: (query) => feedQueries.push(query) },
    )
    await mockIterationDetailSequence(page, 'dir-rep-1', [
      completedIterationDetail('dir-rep-1', analysisTaskId),
    ])

    await completeDeepAnalysis(page, analysisTaskId)

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    await completedRailItem(page, 'dir-rep-1').getByTestId('direction-item-preferred').click()

    const listBefore = collection.listQueries.length
    const detailBefore = collection.detailGets.length
    const candidatesBefore = collection.candidateQueries.length
    const feedBefore = feedQueries.length

    await completedRailItem(page, 'dir-rep-1').getByTestId('direction-item-save-memory').click()
    const selector = representativeSelector(page)
    await expect(selector).toBeVisible({ timeout: 10000 })
    await selector.getByRole('button', { name: /Set as representative/ }).click()
    await expect
      .poll(() => collection.representativeResultRequests.length, { timeout: 15000 })
      .toBe(1)

    // 服务端派生的验证状态与新代表结果：无需整页刷新即可见（AC-06，禁止乐观伪造）
    const status = memoryStatus(page)
    await expect(status).toHaveAttribute('data-verification', 'user_verified', {
      timeout: 15000,
    })
    await expect(status).toHaveAttribute('data-representative-iteration-id', 'dir-rep-1')

    // 统一回读（plan-06 规格 §2）：templates 列表前缀、Memory 详情、代表结果候选、方向 feed 全部重新读取
    await expect
      .poll(() => collection.listQueries.length, { timeout: 15000 })
      .toBeGreaterThan(listBefore)
    await expect
      .poll(() => collection.detailGets.length, { timeout: 15000 })
      .toBeGreaterThan(detailBefore)
    await expect
      .poll(() => collection.candidateQueries.length, { timeout: 15000 })
      .toBeGreaterThan(candidatesBefore)
    await expect
      .poll(() => feedQueries.length, { timeout: 15000 })
      .toBeGreaterThan(feedBefore)

    // preferred 状态与方向 rail 保持一致（写入不丢会话偏好），且只写一次
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-rep-1')
    expect(collection.representativeResultRequests).toHaveLength(1)
  })

  test('TC-6.7 写入成功但部分回读失败：「已保存，刷新失败」只重试读取，不重复 POST', async ({ page }) => {
    const analysisTaskId = 'memory-refresh-fail-analysis-task'
    await seedSourceMemoryDirection(page)
    const collection = await mockStyleMemoryDetailCollection(
      page,
      [sourceMemoryDetail('tpl-src-1')],
      { candidates: { 'tpl-src-1': [representativeCandidate('dir-rep-1')] } },
    )
    const feed = await mockDirectionFeedStateful(page, {
      completed: [directionItem('dir-rep-1')],
      active: null,
      latestFailure: null,
    })
    await mockIterationDetailSequence(page, 'dir-rep-1', [
      completedIterationDetail('dir-rep-1', analysisTaskId),
    ])

    await completeDeepAnalysis(page, analysisTaskId)

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    await completedRailItem(page, 'dir-rep-1').getByTestId('direction-item-preferred').click()

    await completedRailItem(page, 'dir-rep-1').getByTestId('direction-item-save-memory').click()
    const selector = representativeSelector(page)
    await expect(selector).toBeVisible({ timeout: 10000 })
    // 写入本身成功；统一回读中的方向 feed 将失败（L2 503）
    feed.fail()
    await selector.getByRole('button', { name: /Set as representative/ }).click()
    await expect
      .poll(() => collection.representativeResultRequests.length, { timeout: 15000 })
      .toBe(1)

    // 已保存，刷新失败：保留服务端成功事实，不回滚、不重复 POST（AC-06）
    const partial = page.getByTestId('memory-refresh-partial-error')
    await expect(partial).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('memory-refresh-retry')).toBeVisible()
    expect(collection.representativeResultRequests).toHaveLength(1)

    // 只重试读取：feed 恢复后重试成功，不发送第二次写请求
    feed.set({
      completed: [directionItem('dir-rep-1')],
      active: null,
      latestFailure: null,
    })
    await page.getByTestId('memory-refresh-retry').click()
    await expect(partial).toBeHidden({ timeout: 15000 })
    await expect(memoryStatus(page)).toHaveAttribute('data-verification', 'user_verified', {
      timeout: 15000,
    })
    expect(collection.representativeResultRequests).toHaveLength(1)
  })

  test('TC-6.8 设置/更换首选不改变验证状态：零 Memory 写请求', async ({ page }) => {
    const analysisTaskId = 'preferred-no-write-analysis-task'
    await seedSourceMemoryDirection(page)
    const collection = await mockStyleMemoryDetailCollection(
      page,
      [sourceMemoryDetail('tpl-src-1')],
      {
        candidates: {
          'tpl-src-1': [representativeCandidate('dir-verify-1'), representativeCandidate('dir-verify-2')],
        },
      },
    )
    await mockDirectionFeedStateful(page, {
      completed: [
        directionItem('dir-verify-2', { createdAt: '2026-09-01T00:02:00.000Z' }),
        directionItem('dir-verify-1', { createdAt: '2026-09-01T00:01:00.000Z' }),
      ],
      active: null,
      latestFailure: null,
    })
    await mockIterationDetailSequence(page, 'dir-verify-1', [
      completedIterationDetail('dir-verify-1', analysisTaskId),
    ])
    await mockIterationDetailSequence(page, 'dir-verify-2', [
      completedIterationDetail('dir-verify-2', analysisTaskId),
    ])

    await completeDeepAnalysis(page, analysisTaskId)

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    await expect(memoryStatus(page)).toHaveAttribute(
      'data-verification',
      'pending_verification',
      { timeout: 10000 },
    )

    // 设置与更换 preferred：均不触发任何 Memory 写请求（§6.7 实现原则：preferred 从不写 templates）
    await completedRailItem(page, 'dir-verify-1').getByTestId('direction-item-preferred').click()
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-verify-1')
    await completedRailItem(page, 'dir-verify-2').getByTestId('direction-item-preferred').click()
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-verify-2')

    await expect(memoryStatus(page)).toHaveAttribute(
      'data-verification',
      'pending_verification',
    )
    expect(collection.representativeResultRequests).toHaveLength(0)
    expect(collection.putRequests).toHaveLength(0)
  })

  test('TC-6.9 作为新参考：未完成内容确认守卫，取消零写入且焦点回触发器', async ({ page }) => {
    const analysisTaskId = 'newref-cancel-analysis-task'
    await mockDirectionFeedStateful(page, {
      completed: [directionItem('dir-newref-1')],
      active: null,
      latestFailure: null,
    })
    await mockIterationDetailSequence(page, 'dir-newref-1', [
      completedIterationDetail('dir-newref-1', analysisTaskId),
    ])
    const generation = await mockGenerationCreateCapture(page)

    await completeDeepAnalysis(page, analysisTaskId)
    // 在既有 mockAnalysisCreate 之后注册：仅捕获「作为新参考」触发的后续分析 POST
    const analysis = await mockAnalysisCreateCapture(page, 'newref-cancel-2-analysis-task')

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    const compiled = page.getByTestId('compiled-prompt-text')
    const compiledBefore = ((await compiled.textContent()) ?? '').trim()

    // 当前草稿与所选结果快照不同 → 守卫说明将切换的内容（架构 §6.6.2）
    const trigger = completedRailItem(page, 'dir-newref-1').getByTestId(
      'direction-item-new-reference',
    )
    await trigger.click()
    const dialog = newReferenceDialog(page)
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await expect(dialog.getByTestId('new-reference-unfinished-summary')).toBeVisible()

    // 取消：零写入（无新分析 POST、无生成 POST）、草稿逐字保留、焦点回触发器（§6.6.3）
    await dialog.getByTestId('new-reference-confirm-cancel').click()
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(compiled).toHaveText(compiledBefore)
    expect(analysis.requests).toHaveLength(0)
    expect(generation.requests).toHaveLength(0)
  })

  test('TC-6.10 确认作为新参考：POST /api/analysis 仅携带 sourceAssetId、进入新方向分析且旧方向可回溯', async ({ page }) => {
    const analysisTaskId = 'newref-confirm-analysis-task'
    const newAnalysisTaskId = 'newref-confirm-2-analysis-task'
    // 旧方向 Iteration 完整历史：列表 mock 先注册，direction feed 后注册优先生效（fallback 链）
    const oldDirectionItem: MockIterationListItem = {
      id: 'dir-newref-2',
      status: 'completed',
      promptSummary: 'Old direction iteration dir-newref-2',
      resultFileUrl: 'https://cdn.example.com/results/dir-newref-2/result.webp',
      params: { aspectRatio: '1:1', quality: 'standard' },
      createdAt: '2026-09-01T00:01:00.000Z',
    }
    await mockIterationList(page, [oldDirectionItem])
    await mockDirectionFeedStateful(page, {
      completed: [directionItem('dir-newref-2')],
      active: null,
      latestFailure: null,
    })
    await mockIterationDetailSequence(page, 'dir-newref-2', [
      completedIterationDetail('dir-newref-2', analysisTaskId),
    ])
    await mockAnalysisPolling(page, newAnalysisTaskId, {
      ...PROCESSING_ANALYSIS,
      id: newAnalysisTaskId,
    })

    await completeDeepAnalysis(page, analysisTaskId)
    const analysis = await mockAnalysisCreateCapture(page, newAnalysisTaskId)

    const rail = directionRail(page)
    await expect(rail).toBeVisible({ timeout: 10000 })
    await completedRailItem(page, 'dir-newref-2').getByTestId('direction-item-preferred').click()
    await expect(rail).toHaveAttribute('data-preferred-id', 'dir-newref-2')

    await completedRailItem(page, 'dir-newref-2').getByTestId('direction-item-new-reference').click()
    const dialog = newReferenceDialog(page)
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await dialog.getByTestId('new-reference-confirm-accept').click()
    await expect(dialog).toBeHidden()

    // 复用同一 Asset（ADR-6）：只提交 sourceAssetId，不携带 fileUrl/尺寸/MIME（零复制、不重传）
    await expect.poll(() => analysis.requests.length, { timeout: 15000 }).toBe(1)
    const body = analysis.requests[0].body as Record<string, unknown>
    expect(body.sourceAssetId).toBe('asset-dir-newref-2')
    for (const clientComputedField of ['fileUrl', 'width', 'height', 'mimeType', 'assetId']) {
      expect(body).not.toHaveProperty(clientComputedField)
    }

    // 工作区以结果图为参考进入新方向分析（架构 §6.6.4-5）
    await page
      .locator('[data-testid="ai-status-header"][data-phase="analyzing"]')
      .first()
      .waitFor({ timeout: 15000 })

    // 旧方向与全部 Iteration 仍可从完整历史打开（AC-04）
    await page.goto('/workspace/iterations?status=all')
    await expect(
      page.getByTestId('iteration-list-item').filter({ hasText: 'Old direction iteration' }),
    ).toBeVisible({ timeout: 15000 })
  })
})

// ─── plan-07：Workspace 闭环集成与回归（AC-01～AC-07 / US-01～US-11 收口） ──────────────

/** plan-07 共享：手动生成「进行中」详情（终态推进交给方向 feed，与 TC-5.2 同模式） */
function processingGenerationDetail(id: string) {
  return {
    ...loadFixture('generation-completed.json'),
    id,
    status: 'processing',
    resultAssetId: null,
    resultFileUrl: null,
    errorMessage: null,
  }
}

test.describe('plan-07：Workspace 闭环集成与回归（AC-01～07 全旅程收口）', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
    await gotoWorkspace(page)
  })

  test('TC-7.1 全旅程连续性：分析→生成→比较→调整→再生成→首选→Memory→新参考全程不离开 Workspace 且无阻断弹层', async ({
    page,
  }) => {
    const analysisTaskId = 'journey-analysis-task'
    const gen1 = 'journey-gen-1'
    const gen2 = 'journey-gen-2'
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })
    const generation = await mockGenerationCreateSequence(page, [
      { taskId: gen1 },
      { taskId: gen2 },
    ])
    await mockGenerationPolling(page, gen1, processingGenerationDetail(gen1))
    await mockGenerationPolling(page, gen2, processingGenerationDetail(gen2))
    await mockIterationDetailSequence(page, gen1, [
      completedIterationDetail(gen1, analysisTaskId),
    ])
    await mockIterationDetailSequence(page, gen2, [
      completedIterationDetail(gen2, analysisTaskId),
    ])
    const templates = await mockTemplateCreateCapture(page)

    // 1. 分析 → analysis_ready（深入路径证据完整）
    await completeDeepAnalysis(page, analysisTaskId)
    await expect(page).toHaveURL(/\/workspace/)

    // 2. 手动生成 → 进行中/终态全部内联呈现（plan-07：成功不弹层）
    feed.set({
      completed: [],
      active: activeItem(gen1, { createdAt: '2026-09-01T00:10:00.000Z' }),
      latestFailure: null,
    })
    await renderDock(page).getByRole('button', { name: /^Generate$/ }).click()
    await expect.poll(() => generation.requests.length, { timeout: 15000 }).toBe(1)
    await expect(page.getByTestId('direction-active-face')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('generation-dialog')).toBeHidden()
    feed.set({
      completed: [directionItem(gen1, { createdAt: '2026-09-01T00:10:00.000Z' })],
      active: null,
      latestFailure: null,
    })
    await expect(completedRailItem(page, gen1)).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/\/workspace/)

    // 3. 打开比较并应用调整（调整写入当前草稿，AC-05）
    await completedRailItem(page, gen1).getByTestId('direction-item-compare').click()
    const panel = comparisonPanel(page)
    await expect(panel).toBeVisible({ timeout: 10000 })
    await comparisonDimension(page, 'color').click()
    await panel.getByTestId('adjustment-action-strengthen').click()
    await panel.getByTestId('comparison-adjustment-apply').click()
    await expect(panel).toBeHidden()
    await expect(page.getByTestId('compiled-prompt-text')).toContainText(
      `warm amber and sand palette${STRENGTHEN_SUFFIX}`,
    )
    await expect(page).toHaveURL(/\/workspace/)

    // 4. 调整后再生成（只读当前草稿，仍不弹层）
    feed.set({
      completed: [directionItem(gen1, { createdAt: '2026-09-01T00:10:00.000Z' })],
      active: activeItem(gen2, { createdAt: '2026-09-01T00:12:00.000Z' }),
      latestFailure: null,
    })
    await renderDock(page).getByRole('button', { name: /^Generate$/ }).click()
    await expect.poll(() => generation.requests.length, { timeout: 15000 }).toBe(2)
    await expect(page.getByTestId('generation-dialog')).toBeHidden()
    feed.set({
      completed: [
        directionItem(gen2, { createdAt: '2026-09-01T00:12:00.000Z' }),
        directionItem(gen1, { createdAt: '2026-09-01T00:10:00.000Z' }),
      ],
      active: null,
      latestFailure: null,
    })
    await expect(completedRailItem(page, gen2)).toBeVisible({ timeout: 15000 })

    // 5. 设置本次首选（会话偏好，AC-06）
    await completedRailItem(page, gen2).getByTestId('direction-item-preferred').click()
    await expect(directionRail(page)).toHaveAttribute('data-preferred-id', gen2)

    // 6. Memory 入口在当前上下文打开（取消零写入，旅程继续）
    await completedRailItem(page, gen2).getByTestId('direction-item-save-memory').click()
    const saveDialog = saveMemoryDialog(page)
    await expect(saveDialog).toBeVisible({ timeout: 10000 })
    await saveDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(saveDialog).toBeHidden()
    expect(templates.requests).toHaveLength(0)
    await expect(page).toHaveURL(/\/workspace/)

    // 7. 结果作为新参考：守卫确认 → 仅提交 sourceAssetId → 原地进入新方向分析
    const newAnalysisTaskId = 'journey-new-analysis-task'
    await mockAnalysisPolling(page, newAnalysisTaskId, {
      ...PROCESSING_ANALYSIS,
      id: newAnalysisTaskId,
    })
    const analysis = await mockAnalysisCreateCapture(page, newAnalysisTaskId)
    await completedRailItem(page, gen2).getByTestId('direction-item-new-reference').click()
    const guard = newReferenceDialog(page)
    await expect(guard).toBeVisible({ timeout: 10000 })
    await guard.getByTestId('new-reference-confirm-accept').click()
    await expect(guard).toBeHidden()
    await expect.poll(() => analysis.requests.length, { timeout: 15000 }).toBe(1)
    expect((analysis.requests[0].body as Record<string, unknown>).sourceAssetId).toBe(
      `asset-${gen2}`,
    )
    await page
      .locator('[data-testid="ai-status-header"][data-phase="analyzing"]')
      .first()
      .waitFor({ timeout: 15000 })
    await expect(page).toHaveURL(/\/workspace/)

    // 全程零阻断式 GenerationDialog、两次手动生成、一次新参考分析
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
    expect(generation.requests).toHaveLength(2)
  })

  test('TC-7.2 手动生成成功全程内联：不打开阻断式 GenerationDialog，成功后上下文保持可编辑', async ({
    page,
  }) => {
    const analysisTaskId = 'inline-success-analysis-task'
    const genId = 'inline-success-gen'
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })
    const generation = await mockGenerationCreateSequence(page, [{ taskId: genId }])
    await mockGenerationPolling(page, genId, processingGenerationDetail(genId))
    await completeDeepAnalysis(page, analysisTaskId)

    // 提交与进行中均内联：active face 可见，阻断弹层不出现（plan-07 验收：成功不弹层）
    feed.set({
      completed: [],
      active: activeItem(genId, { createdAt: '2026-09-01T00:06:00.000Z' }),
      latestFailure: null,
    })
    await renderDock(page).getByRole('button', { name: /^Generate$/ }).click()
    await expect.poll(() => generation.requests.length, { timeout: 15000 }).toBe(1)
    await expect(page.getByTestId('direction-active-face')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('generation-dialog')).toBeHidden()

    // 终态：新成功进入 rail、渲染真实图片并成为当前选择（AC-04）
    feed.set({
      completed: [directionItem(genId, { createdAt: '2026-09-01T00:06:00.000Z' })],
      active: null,
      latestFailure: null,
    })
    const newItem = completedRailItem(page, genId)
    await expect(newItem).toBeVisible({ timeout: 15000 })
    await expect(newItem).toHaveAttribute('data-selected', 'true')
    await expect(newItem.locator('img')).toBeVisible()

    // 成功后上下文不被阻断：三栏可见，Prompt 仍可继续编辑（切换 detail 即时生效）
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(referenceCard(page).getByTestId('reference-image-stage')).toBeVisible()
    await expect(page.getByTestId('compiled-prompt-text')).toBeVisible()
    const controls = promptControls(page)
    await controls.getByTestId('detail-option-concise').click()
    await expect(controls).toHaveAttribute('data-detail', 'concise')
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
  })

  test('TC-7.3 Provider 失败内联恢复（L3）：失败原因与恢复动作留在本次结果区，重试创建新任务并成功', async ({
    page,
  }) => {
    const analysisTaskId = 'inline-failure-analysis-task'
    const failedId = 'inline-failure-gen'
    const retryId = 'inline-failure-retry-gen'
    const failure = directionItem(failedId, {
      status: 'failed',
      resultFileUrl: null,
      resultAssetId: null,
      errorMessage: 'Image provider timed out after submission',
      createdAt: '2026-09-01T00:05:00.000Z',
    })
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })
    const generation = await mockGenerationCreateSequence(page, [
      { taskId: failedId },
      { taskId: retryId },
    ])
    // 对齐 GET /api/generation/[id] 详情超集：Provider 提交后失败终态
    await mockGenerationPolling(page, failedId, {
      id: failedId,
      analysisTaskId,
      status: 'failed',
      promptSnapshot: 'Inline failure preserved prompt snapshot',
      negativePromptSnapshot: 'low quality',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'flux.2',
      resultAssetId: null,
      resultFileUrl: null,
      errorMessage: 'Image provider timed out after submission',
      createdAt: '2026-09-01T00:05:00.000Z',
      updatedAt: '2026-09-01T00:05:30.000Z',
    })
    await mockGenerationPolling(page, retryId, processingGenerationDetail(retryId))
    await completeDeepAnalysis(page, analysisTaskId)

    // 提交 → Provider 失败：失败事实进入 latestFailure（feed SSOT），全程无弹层
    feed.set({
      completed: [],
      active: activeItem(failedId, { createdAt: '2026-09-01T00:04:30.000Z' }),
      latestFailure: null,
    })
    await renderDock(page).getByRole('button', { name: /^Generate$/ }).click()
    await expect.poll(() => generation.requests.length, { timeout: 15000 }).toBe(1)
    await expect(page.getByTestId('generation-dialog')).toBeHidden()
    feed.set({ completed: [], active: null, latestFailure: failure })
    const failureFace = page.getByTestId('direction-failure-face')
    await expect(failureFace).toBeVisible({ timeout: 15000 })
    await expect(failureFace.getByText(/Image provider timed out/)).toBeVisible()

    // 失败保留编辑上下文：三栏与草稿仍在（§8.2 L3 保留能力）
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(referenceCard(page).getByTestId('reference-image-stage')).toBeVisible()
    await expect(page.getByTestId('compiled-prompt-text')).toBeVisible()

    // 主动恢复：重试创建新任务（不复活原任务）并成功，恢复动作同样内联
    feed.set({
      completed: [],
      active: activeItem(retryId, { createdAt: '2026-09-01T00:07:00.000Z' }),
      latestFailure: failure,
    })
    await page.getByTestId('direction-failure-retry').click()
    await expect.poll(() => generation.requests.length, { timeout: 15000 }).toBe(2)
    expect(
      (generation.requests[1].body as { analysisTaskId?: unknown }).analysisTaskId,
    ).toBe(analysisTaskId)
    feed.set({
      completed: [directionItem(retryId, { createdAt: '2026-09-01T00:07:00.000Z' })],
      active: null,
      latestFailure: null,
    })
    await expect(completedRailItem(page, retryId)).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
  })

  test('TC-7.4 键盘焦点旅程连续：比较开关/取消/应用有确定焦点，完成通知 polite 不夺编辑焦点', async ({
    page,
  }) => {
    const analysisTaskId = 'keyboard-journey-analysis-task'
    const iterId = 'keyboard-journey-gen-1'
    const gen2 = 'keyboard-journey-gen-2'
    const feed = await mockDirectionFeedStateful(page, {
      completed: [directionItem(iterId, { createdAt: '2026-09-01T00:01:00.000Z' })],
      active: null,
      latestFailure: null,
    })
    await mockIterationDetailSequence(page, iterId, [
      completedIterationDetail(iterId, analysisTaskId),
    ])
    const generation = await mockGenerationCreateSequence(page, [{ taskId: gen2 }])
    await mockGenerationPolling(page, gen2, processingGenerationDetail(gen2))
    await completeDeepAnalysis(page, analysisTaskId)

    // 键盘打开比较：Space 激活比较按钮 → 面板打开且标题获得焦点（ADR-7，US-11）。
    // 注：现实现存在全局 Enter 生成快捷键（page.tsx keydown handler 未排除聚焦
    // button），会劫持 Enter 的控件激活——该冲突作为发现移交 plan-07 Task 5，
    // 本用例以 Space 验证键盘可操作性（button 的标准键盘激活之一）。
    const trigger = completedRailItem(page, iterId).getByTestId('direction-item-compare')
    await trigger.focus()
    await page.keyboard.press('Space')
    const panel = comparisonPanel(page)
    await expect(panel).toBeVisible({ timeout: 10000 })
    await expect(panel.getByTestId('comparison-panel-title')).toBeFocused()

    // 键盘取消：面板关闭，焦点确定回到比较触发器
    await panel.getByTestId('comparison-adjustment-cancel').focus()
    await page.keyboard.press('Space')
    await expect(panel).toBeHidden()
    await expect(trigger).toBeFocused()

    // 键盘应用调整：面板关闭，焦点移至更新的「保留 / 改变」摘要项
    await trigger.focus()
    await page.keyboard.press('Space')
    await expect(panel).toBeVisible({ timeout: 10000 })
    await comparisonDimension(page, 'color').click()
    await panel.getByTestId('adjustment-action-strengthen').focus()
    await page.keyboard.press('Space')
    await panel.getByTestId('comparison-adjustment-apply').focus()
    await page.keyboard.press('Space')
    await expect(panel).toBeHidden()
    await expect(
      page.locator('[data-testid="keep-change-item"][data-target-id="color_invariant_1"]'),
    ).toBeFocused()

    // 用户正在编辑全文时任务完成：结果通知走 polite live region，不移动编辑焦点
    //（编辑模式切换用键盘激活：本用例目标是焦点旅程契约；控件指针可达性
    //  由 TC-7.5 的 click 与 TC-7.9 的视口断言钉住）
    const controls = promptControls(page)
    await controls.getByTestId('editor-mode-option-text').focus()
    await page.keyboard.press('Space')
    await expect(controls).toHaveAttribute('data-editor-mode', 'text')
    const fulltext = page.getByTestId('fulltext-prompt-editor')
    await expect(fulltext).toBeVisible()
    await fulltext.fill('Keyboard journey prompt being edited while rendering completes')
    feed.set({
      completed: [directionItem(iterId, { createdAt: '2026-09-01T00:01:00.000Z' })],
      active: activeItem(gen2, { createdAt: '2026-09-01T00:08:00.000Z' }),
      latestFailure: null,
    })
    await renderDock(page).getByRole('button', { name: /^Generate$/ }).click()
    await expect.poll(() => generation.requests.length, { timeout: 15000 }).toBe(1)
    await fulltext.focus()
    await page.keyboard.type(' — still typing')
    feed.set({
      completed: [
        directionItem(gen2, { createdAt: '2026-09-01T00:08:00.000Z' }),
        directionItem(iterId, { createdAt: '2026-09-01T00:01:00.000Z' }),
      ],
      active: null,
      latestFailure: null,
    })
    await expect(completedRailItem(page, gen2)).toBeVisible({ timeout: 15000 })
    // plan-07 契约：工作区结果通知为 polite live region（§3.3），成功不弹层也不夺焦点
    await expect(page.getByTestId('workspace-live-region')).toHaveAttribute(
      'aria-live',
      'polite',
    )
    await expect(page.getByTestId('generation-dialog')).toBeHidden()
    await expect(fulltext).toBeFocused()
  })

  test('TC-7.5 L1 降级：自定义全文应用「不再保留」未命中表达时明确说明，不声称已删除且草稿不被改写', async ({
    page,
  }) => {
    const analysisTaskId = 'l1-miss-analysis-task'
    const iterId = 'l1-miss-gen'
    await mockDirectionFeedStateful(page, {
      completed: [directionItem(iterId)],
      active: null,
      latestFailure: null,
    })
    await mockIterationDetailSequence(page, iterId, [
      completedIterationDetail(iterId, analysisTaskId),
    ])
    await completeDeepAnalysis(page, analysisTaskId)

    // 手动改写全文：文本不包含 lighting 规则表达（range 无法命中，架构 §8.2 L1）
    const controls = promptControls(page)
    await controls.getByTestId('editor-mode-option-text').click()
    const fulltext = page.getByTestId('fulltext-prompt-editor')
    const manualText = 'A fully hand-written prompt without any rule expressions.'
    await fulltext.fill(manualText)

    // 比较中选择 lighting 规则（单条可见预选）并应用「不再保留」（disable）
    await completedRailItem(page, iterId).getByTestId('direction-item-compare').click()
    const panel = comparisonPanel(page)
    await expect(panel).toBeVisible({ timeout: 10000 })
    await comparisonDimension(page, 'lighting').click()
    await expect(comparisonInvariant(page, 'lighting_invariant_1')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await panel.getByTestId('adjustment-action-disable').click()
    await panel.getByTestId('comparison-adjustment-apply').click()
    await expect(panel).toBeHidden()

    // L1 明确说明：未找到可删除的表达，不静默、不声称已删除（§6.2 实现原则）
    const missNote = page.getByTestId('prompt-adjustment-miss-note')
    await expect(missNote).toBeVisible({ timeout: 10000 })
    await expect(missNote).toHaveAttribute('data-invariant-id', 'lighting_invariant_1')

    // 规则确实停用（保留项 5 → 4），但全文逐字保留（未命中不做删除/追加）
    await expect(
      keepChangeSummary(page).locator(
        '[data-testid="keep-change-item"][data-kind="keep"]',
      ),
    ).toHaveCount(4)
    await expect(fulltext).toHaveValue(manualText)
  })

  test('TC-7.6 L2 降级：方向 feed 失败提供重试与打开 Iteration 出口，缓存/草稿/生成能力保留且不遮挡编辑上下文', async ({
    page,
  }) => {
    const analysisTaskId = 'l2-feed-analysis-task'
    const c1 = directionItem('l2-feed-c1', { createdAt: '2026-09-01T00:01:00.000Z' })
    const c2 = directionItem('l2-feed-c2', { createdAt: '2026-09-01T00:02:00.000Z' })
    const feed = await mockDirectionFeedStateful(page, {
      completed: [c2, c1],
      active: activeItem('l2-feed-active', { createdAt: '2026-09-01T00:03:00.000Z' }),
      latestFailure: null,
    })
    const generation = await mockGenerationCreateSequence(page, [
      { taskId: 'l2-feed-manual-gen' },
    ])
    await completeDeepAnalysis(page, analysisTaskId)

    const rail = directionRail(page)
    await expect(rail.getByTestId('direction-completed-item')).toHaveCount(2)
    const compiled = page.getByTestId('compiled-prompt-text')
    const compiledBefore = ((await compiled.textContent()) ?? '').trim()

    // L2：active 定时刷新命中 503 → 错误位呈现，已展示结果与草稿保留
    feed.fail()
    await expect(rail.getByTestId('direction-feed-error')).toBeVisible({ timeout: 15000 })
    await expect(rail.getByTestId('direction-feed-retry')).toBeVisible()
    await expect(rail.getByTestId('direction-completed-item')).toHaveCount(2)
    await expect(compiled).toHaveText(compiledBefore)

    // §8.2 L2「结果位显示重试/打开 Iteration」：错误位提供打开完整 Iteration 出口
    const openIteration = rail.getByTestId('direction-feed-open-iteration')
    await expect(openIteration).toBeVisible()

    // 不遮挡编辑上下文：三栏可见，Prompt 编辑与手动生成继续可用（L2 保留能力）
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(compiled).toBeVisible()
    await expect(
      renderDock(page).getByRole('button', { name: /^Generate$/ }),
    ).toBeEnabled()
    expect(generation.requests).toHaveLength(0)

    // 出口可达：打开完整 Iteration 历史（列表 mock 兜底）
    await openIteration.click()
    await expect(page).toHaveURL(/\/workspace\/iterations/)
  })

  test('TC-7.7 L4 降级：armed 分析失败复位授权并保留上下文，重试恢复后不延迟自动提交；手动生成成功不弹层', async ({
    page,
  }) => {
    const failedTaskId = 'l4-failed-analysis-task'
    const recoveredTaskId = 'l4-recovered-analysis-task'
    const genId = 'l4-manual-gen'
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })
    const generation = await mockGenerationCreateSequence(page, [{ taskId: genId }])
    await mockGenerationPolling(page, genId, processingGenerationDetail(genId))
    await mockUploadPresign(page)
    await mockAnalysisCreateSequence(page, [failedTaskId, recoveredTaskId])
    await mockAnalysisPolling(page, failedTaskId, {
      ...FAILED_ANALYSIS,
      id: failedTaskId,
    })
    await mockAnalysisPolling(page, recoveredTaskId, {
      ...loadFixture('analysis-v2-completed.json'),
      id: recoveredTaskId,
    })

    await chooseQuickRecreatePace(page)
    await confirmQuickRecreate(page)
    await uploadReference(page)

    // L4：分析失败 → armed 复位 none、清除原因说明、参考上下文保留，无阻断弹层
    await expect(referenceCard(page).getByText('Analysis failed')).toBeVisible({
      timeout: 15000,
    })
    await expect(referenceCard(page).getByTestId('reference-image-stage')).toBeVisible()
    await expect(page.getByTestId('quick-authorization-cleared-reason')).toBeVisible()
    await expect(page.getByTestId('quick-authorization-status')).toHaveAttribute(
      'data-authorization',
      'none',
    )
    await expect(page.getByTestId('generation-dialog')).toBeHidden()

    // 主动重试恢复 analysis_ready：不复活 armed、零自动生成（条件恢复不延迟触发）
    await referenceCard(page).getByRole('button', { name: 'Retry analysis' }).click()
    await expectDirectionEvidenceComplete(page)
    await expect(page.getByTestId('quick-authorization-status')).toHaveAttribute(
      'data-authorization',
      'none',
    )
    expect(generation.requests).toHaveLength(0)

    // 恢复后手动生成成功：内联呈现、不弹层（plan-07 成功契约）
    feed.set({
      completed: [],
      active: activeItem(genId, { createdAt: '2026-09-01T00:09:00.000Z' }),
      latestFailure: null,
    })
    await renderDock(page).getByRole('button', { name: /^Generate$/ }).click()
    await expect.poll(() => generation.requests.length, { timeout: 15000 }).toBe(1)
    await expect(page.getByTestId('generation-dialog')).toBeHidden()
    feed.set({
      completed: [directionItem(genId, { createdAt: '2026-09-01T00:09:00.000Z' })],
      active: null,
      latestFailure: null,
    })
    await expect(completedRailItem(page, genId)).toBeVisible({ timeout: 15000 })
    expect(generation.requests).toHaveLength(1)
  })

  test('TC-7.8 L5 降级：生成提交服务错误内联呈现，不声称任务已创建；草稿保留且主动重试后成功', async ({
    page,
  }) => {
    const analysisTaskId = 'l5-submit-analysis-task'
    const retryGenId = 'l5-retry-gen'
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })
    const generation = await mockGenerationCreateSequence(page, [
      {
        status: 503,
        body: {
          error: 'Service temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
          retryable: true,
        },
      },
      { taskId: retryGenId },
    ])
    await mockGenerationPolling(page, retryGenId, processingGenerationDetail(retryGenId))
    await completeDeepAnalysis(page, analysisTaskId)

    // 提交失败（DB/服务不可用，§8.2 L5）：内联错误位 + 主动重试，不弹层
    await renderDock(page).getByRole('button', { name: /^Generate$/ }).click()
    await expect.poll(() => generation.requests.length, { timeout: 15000 }).toBe(1)
    const submitError = page.getByTestId('generation-submit-error')
    await expect(submitError).toBeVisible({ timeout: 15000 })
    await expect(submitError).toContainText(/Service temporarily unavailable/)
    await expect(page.getByTestId('generation-submit-retry')).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toBeHidden()

    // 不声称任务已创建：无 active face（任务事实由服务端 SSOT 派生）
    await expect(page.getByTestId('direction-active-face')).toHaveCount(0)

    // 草稿与参数保留（sessionStorage 草稿不清除，编辑能力不受影响）
    await expect(page.getByTestId('compiled-prompt-text')).toBeVisible()
    await expect(renderDock(page).getByLabel('Aspect Ratio')).toBeEnabled()

    // 主动重试创建新任务并成功（L5 下一步：稍后重试而非重来）
    feed.set({
      completed: [],
      active: activeItem(retryGenId, { createdAt: '2026-09-01T00:11:00.000Z' }),
      latestFailure: null,
    })
    await page.getByTestId('generation-submit-retry').click()
    await expect.poll(() => generation.requests.length, { timeout: 15000 }).toBe(2)
    await expect(page.getByTestId('generation-submit-error')).toBeHidden({ timeout: 15000 })
    feed.set({
      completed: [directionItem(retryGenId, { createdAt: '2026-09-01T00:11:00.000Z' })],
      active: null,
      latestFailure: null,
    })
    await expect(completedRailItem(page, retryGenId)).toBeVisible({ timeout: 15000 })
  })
})
