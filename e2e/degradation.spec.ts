import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockApiError,
  mockAuthSession,
  mockGenerationCreate,
  mockGenerationList,
  mockGenerationPolling,
  mockUploadPresign,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'
import {
  gotoWorkspace,
  TEST_IMAGE_PATH,
  uploadAndCompleteAnalysis,
} from './helpers/workspace-actions'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function mockCdnImages(page: Page) {
  await page.route('https://cdn.example.com/**', async (route) => {
    if (
      route.request().resourceType() === 'image' ||
      /\.(png|jpg|webp)$/.test(route.request().url())
    ) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      return
    }
    await route.continue()
  })
}

/** 现行三栏布局：Reference Canvas / Style Intelligence / Prompt and Render */
function referenceColumn(page: Page) {
  return page.getByRole('region', { name: 'Reference Canvas column' })
}

function styleIntelligenceColumn(page: Page) {
  return page.getByRole('region', { name: 'Style Intelligence column' })
}

function promptColumn(page: Page) {
  return page.getByRole('region', { name: 'Prompt and Render column' })
}

/** 现行生成入口：Prompt and Render 列内的 Render Dock（output-card） */
function renderDock(page: Page) {
  return promptColumn(page).getByTestId('output-card')
}

function generateButton(page: Page) {
  return renderDock(page).getByRole('button', { name: /^Generate$/i })
}

const SERVICE_UNAVAILABLE_BODY = {
  error: 'Service Temporarily Unavailable',
  code: 'SERVICE_UNAVAILABLE',
  retryable: true,
}

test.describe('Degradation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    // History strip（底部 Recent iterations）挂载即 GET 生成列表
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  /**
   * L1 分析排队（>60s）。
   * 旧 UI 的 “Analysis is queued. Thanks for waiting.” 提示卡（RecipeStep/
   * RecipeEditor）已随三栏重构移除，且现行挂载组件均不消费
   * analysisQueueing（分析侧已无提示等价物，参见 workspace-degradation.spec.ts
   * 的同结论注释）。保留 fake-clock 快进 60s 阈值的触发方式与“分析侧”侧重，
   * 断言排队超阈值后工作台仍稳定停留在分析等待态：不失败、不降级、
   * Style Intelligence 保持加载骨架、参考上下文保留。
   */
  test('L1 分析排队提示', async ({ page }) => {
    const taskId = 'degradation-l1-analysis-queueing-task'

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)

    // Mock polling always returns processing (never completes)
    await mockAnalysisPolling(page, taskId, {
      id: taskId,
      status: 'processing',
      recipe: null,
      promptText: null,
      negativePromptText: null,
      errorMessage: null,
      errorStage: null,
    })

    await gotoWorkspace(page)

    // Install fake clock（保持真实走时），保留 60s 阈值的快进触发方式
    await page.clock.install()

    const referenceInput = referenceColumn(page).locator('input[type="file"]')
    await waitForReactInput(referenceInput)
    await referenceInput.setInputFiles(TEST_IMAGE_PATH)

    // 分析进行中：AI 状态带进入 analyzing phase，Style Intelligence 呈现加载骨架
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'analyzing',
      { timeout: 15000 },
    )
    const recipeCard = styleIntelligenceColumn(page).getByTestId('recipe-card')
    await expect(recipeCard.getByLabel('Visual Recipe loading')).toBeVisible()

    // Fast-forward 61 seconds to trigger the L1 queueing threshold
    await page.clock.fastForward(61000)

    // 长时间排队后仍保持分析等待态：未失败（Reference 卡无错误三段式）、
    // 未降级（Services 仍 ready）、骨架仍在
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'analyzing',
    )
    await expect(recipeCard.getByLabel('Visual Recipe loading')).toBeVisible()
    await expect(page.getByTestId('ai-copilot-ribbon')).toHaveAttribute(
      'data-service',
      'ready',
    )
    await expect(
      referenceColumn(page).getByTestId('reference-card'),
    ).not.toContainText('Analysis failed')
  })

  /**
   * L1 生成排队（>60s）：排队提示现于生成任务弹窗（GenerationDialog）内呈现。
   */
  test('L1 生成排队提示', async ({ page }) => {
    const generationTaskId = 'degradation-l1-generation-queueing-task'
    await mockGenerationCreate(page, generationTaskId)
    await mockGenerationPolling(page, generationTaskId, {
      id: generationTaskId,
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    // Install fake clock（保持真实走时）
    await page.clock.install()

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-l1-generation-queueing-analysis-task',
    })

    await generateButton(page).click()

    // Wait for generation progress
    const dialog = page.getByTestId('generation-dialog')
    await expect(
      page.getByRole('dialog', { name: 'Generation Task' }),
    ).toBeVisible()
    await expect(dialog).toContainText('Generating image...', { timeout: 15000 })

    // Fast-forward 61 seconds to trigger the L1 queueing hint
    await page.clock.fastForward(61000)

    await expect(dialog).toContainText('Generation is queued. Thanks for waiting')
  })

  /**
   * L2 生成不可用：POST /api/generation 500 → 生成任务弹窗以三段式
   * （发生了什么 / 保留了什么 / 下一步）呈现服务不可用错误。
   */
  test('L2 生成服务不可用', async ({ page }) => {
    await mockApiError(page, '**/api/generation', 500, SERVICE_UNAVAILABLE_BODY)

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-l2-unavailable-analysis-task',
    })
    await expect(generateButton(page)).toBeEnabled()

    await generateButton(page).click()

    const dialog = page.getByTestId('generation-dialog')
    await expect(dialog).toContainText('Generation Failed', { timeout: 15000 })
    await expect(dialog).toContainText('Service Temporarily Unavailable')
    await expect(dialog).toContainText('are preserved')
  })

  /**
   * L2 降级后保留分析和编辑：生成失败返回编辑态后，分析结果
   * （旧 style-breakdown-panel → 现行 Style Intelligence 的 recipe-card）与
   * Prompt 编辑器均保留可用，仅生成入口因 generationUnavailable 降级。
   */
  test('L2 降级后保留分析和编辑', async ({ page }) => {
    await mockApiError(page, '**/api/generation', 500, SERVICE_UNAVAILABLE_BODY)

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-l2-preserve-analysis-task',
    })

    await generateButton(page).click()
    const dialog = page.getByTestId('generation-dialog')
    await expect(dialog).toContainText('Generation Failed', { timeout: 15000 })

    // 返回编辑态：上下文保留是本用例的核心断言
    await dialog.getByRole('button', { name: 'Back to Edit' }).click()
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    // 分析结果保留：Style Intelligence 仍展示结构化配方（Style DNA 维度）
    const recipeCard = styleIntelligenceColumn(page).getByTestId('recipe-card')
    await expect(recipeCard).toBeVisible()
    await expect(recipeCard.getByTestId('style-dna')).toContainText(
      '5 dimensions',
    )

    // Prompt editor should still be usable
    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(promptCard.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(promptCard.getByLabel('Full Generation Prompt')).toBeEditable()

    // 生成服务降级的现行可观察标记：Render Dock disabled + title=disabledReason
    await expect(renderDock(page)).toHaveAttribute(
      'data-readiness-can-generate',
      'false',
    )
    await expect(generateButton(page)).toBeDisabled()
    await expect(generateButton(page)).toHaveAttribute(
      'title',
      'Generation service is temporarily unavailable. Retry service when ready.',
    )
  })

  /**
   * L3 LLM 失败降级展示：analysisTemplateStatus=fallback → Prompt 编辑器展示
   * 降级提示及原因（旧 “AI structuring failed…” 文案 → 现行
   * “No stable replaceable variables…” + templateReason），recipe 为 null 时
   * Style Intelligence 呈现空态而非配方摘要。
   */
  test('L3 LLM 失败降级展示', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-l3-analysis-task',
      analysisResponse: loadFixture('analysis-degraded.json'),
    })

    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(
      promptCard.getByText(
        'No stable replaceable variables were detected this time.',
      ),
    ).toBeVisible({ timeout: 15000 })
    await expect(promptCard.getByTestId('unified-prompt-editor')).toContainText(
      'Structure analysis failed: Invalid JSON',
    )

    // Prompt editor should show the raw analysis text
    const promptTextarea = promptCard.getByLabel('Full Generation Prompt')
    await expect(promptTextarea).toHaveValue(/Raw visual analysis/)
    await expect(promptTextarea).toBeEditable()

    // Recipe summary should NOT be shown when recipe is null（旧断言的现行等价物：
    // recipe-card 空态，无 Content 结构化摘要）
    const recipeCard = styleIntelligenceColumn(page).getByTestId('recipe-card')
    await expect(recipeCard.getByText('Waiting for style signals')).toBeVisible()
    await expect(recipeCard.getByTestId('content-analysis')).toHaveCount(0)
  })

  /**
   * L3 降级后仍可编辑和生成：降级态下 Prompt 可编辑，生成成功后现行结果
   * 呈现于生成任务弹窗内（旧 h3 “Generated Result” 的现行等价位置）。
   */
  test('L3 降级后仍可编辑和生成', async ({ page }) => {
    const genTaskId = 'degradation-l3-generation-task'
    const generationCompleted = loadFixture('generation-completed.json')

    await mockGenerationCreate(page, genTaskId)
    await mockGenerationPolling(page, genTaskId, generationCompleted)

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-l3-edit-analysis-task',
      analysisResponse: loadFixture('analysis-degraded.json'),
    })

    // Wait for L3 degradation hint
    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(
      promptCard.getByText(
        'No stable replaceable variables were detected this time.',
      ),
    ).toBeVisible({ timeout: 15000 })

    // Edit prompt
    const promptTextarea = promptCard.getByLabel('Full Generation Prompt')
    await promptTextarea.fill('Manually edited prompt for generation')

    // Click generate
    await expect(generateButton(page)).toBeEnabled()
    await generateButton(page).click()

    // Should successfully generate（结果标题在生成任务弹窗内）
    const dialog = page.getByTestId('generation-dialog')
    await expect(
      dialog.getByRole('heading', { name: 'Generated Result' }),
    ).toBeVisible({ timeout: 15000 })
  })

  /**
   * L4 分析不可用：POST /api/analysis 500 → Reference Canvas 以三段式
   * （发生了什么 / 保留了什么 / 下一步）呈现失败，现行直接展示 API 错误详情
   * （旧按 code 映射的 “Service Temporarily Unavailable” 标题已不存在）。
   */
  test('L4 分析服务不可用', async ({ page }) => {
    await mockUploadPresign(page)

    // Mock analysis POST returning SERVICE_UNAVAILABLE
    await mockApiError(page, '**/api/analysis', 500, {
      error: 'Analysis is temporarily unavailable. Please try again later.',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await gotoWorkspace(page)
    const referenceInput = referenceColumn(page).locator('input[type="file"]')
    await waitForReactInput(referenceInput)
    await referenceInput.setInputFiles(TEST_IMAGE_PATH)

    // Reference Canvas 失败三段式 + 下一步（Retry analysis）
    const referenceCard = referenceColumn(page).getByTestId('reference-card')
    await expect(referenceCard.getByText('Analysis failed')).toBeVisible({
      timeout: 15000,
    })
    await expect(
      referenceCard.getByText(
        'Analysis is temporarily unavailable. Please try again later.',
      ),
    ).toBeVisible()
    await expect(
      referenceCard.getByText(/Reference context preserved/),
    ).toBeVisible()
    await expect(
      referenceCard.getByRole('button', { name: 'Retry analysis' }),
    ).toBeVisible()

    // AI 状态带标记服务降级：failure phase + Services Limited
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'failure',
    )
    await expect(page.getByTestId('ai-copilot-ribbon')).toHaveAttribute(
      'data-service',
      'limited',
    )
  })
})
