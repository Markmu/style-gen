import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockApiError,
  mockAuthSession,
  mockDirectionFeedStateful,
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
   * L1 生成排队（>60s）：plan-07 后排队提示内联呈现于 Render Dock
   * （output-card），不再打开生成任务弹窗。
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

    // 进行中内联呈现：阶段进入 generating，不打开生成任务弹层
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'generating',
      { timeout: 15000 },
    )
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    // Fast-forward 61 seconds to trigger the L1 queueing hint（Render Dock 内联）
    await page.clock.fastForward(61000)

    await expect(renderDock(page)).toContainText('Generation is queued. Thanks for waiting')
  })

  /**
   * L2 生成不可用：POST /api/generation 500 → plan-07 后以内联
   * `generation-submit-error` 三段式（发生了什么 / 保留了什么 / 下一步）呈现。
   */
  test('L2 生成服务不可用', async ({ page }) => {
    await mockApiError(page, '**/api/generation', 500, SERVICE_UNAVAILABLE_BODY)

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-l2-unavailable-analysis-task',
    })
    await expect(generateButton(page)).toBeEnabled()

    await generateButton(page).click()

    // 提交失败内联呈现（§8.2 L5）：错误可见、不声称任务已创建、提供主动重试
    const submitError = page.getByTestId('generation-submit-error')
    await expect(submitError).toBeVisible({ timeout: 15000 })
    await expect(submitError).toContainText('Service Temporarily Unavailable')
    await expect(submitError).toContainText('保持不变')
    await expect(page.getByTestId('generation-submit-retry')).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
  })

  /**
   * L2 降级后保留分析和编辑：生成提交失败后，分析结果
   * （旧 style-breakdown-panel → 现行 Style Intelligence 的 recipe-card）与
   * Prompt 编辑器均保留可用；plan-07 后错误内联呈现、主动重试创建新任务
   * （提交失败不长期禁用 Generate，TC-7.8 契约）。
   */
  test('L2 降级后保留分析和编辑', async ({ page }) => {
    await mockApiError(page, '**/api/generation', 500, SERVICE_UNAVAILABLE_BODY)

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-l2-preserve-analysis-task',
    })

    await generateButton(page).click()
    const submitError = page.getByTestId('generation-submit-error')
    await expect(submitError).toBeVisible({ timeout: 15000 })
    await expect(submitError).toContainText('Service Temporarily Unavailable')
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    // 上下文保留是本用例的核心断言（无弹层关闭步骤，三栏直接可检查）
    const recipeCard = styleIntelligenceColumn(page).getByTestId('recipe-card')
    await expect(recipeCard).toBeVisible()
    await expect(recipeCard.getByTestId('style-dna')).toContainText(
      '5 dimensions',
    )

    // Prompt editor should still be usable
    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(promptCard.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(promptCard.getByLabel('Full Generation Prompt')).toBeEditable()

    // 生成降级的现行可观察标记：内联错误位 + 主动重试入口保持可用
    await expect(page.getByTestId('generation-submit-retry')).toBeVisible()
    await expect(generateButton(page)).toBeEnabled()
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
   * L3 降级后仍可编辑和生成：降级态下 Prompt 可编辑，生成成功后结果内联
   * 进入本次结果区（plan-07：不再经由生成任务弹窗）。
   */
  test('L3 降级后仍可编辑和生成', async ({ page }) => {
    const genTaskId = 'degradation-l3-generation-task'
    const generationCompleted = loadFixture('generation-completed.json')

    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })
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

    // Should successfully generate（结果内联进入本次结果区，渲染真实图片）
    feed.set({
      completed: [
        {
          id: genTaskId,
          status: 'completed',
          promptSummary: 'Degradation L3 recovered iteration',
          resultFileUrl: 'https://cdn.example.com/results/degradation-l3/result.webp',
          params: { aspectRatio: '1:1', quality: 'standard' },
          createdAt: '2026-09-01T00:00:00.000Z',
          resultAssetId: `asset-${genTaskId}`,
          errorMessage: null,
        },
      ],
      active: null,
      latestFailure: null,
    })
    const completedItem = page.locator(
      `[data-testid="direction-completed-item"][data-iteration-id="${genTaskId}"]`,
    )
    await expect(completedItem).toBeVisible({ timeout: 15000 })
    await expect(completedItem.locator('img')).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
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
