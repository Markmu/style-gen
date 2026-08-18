import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
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

/** 现行三栏布局：Reference Canvas / Prompt and Render */
function referenceColumn(page: Page) {
  return page.getByRole('region', { name: 'Reference Canvas column' })
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

test.describe('Workspace Degradation Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    // History strip（底部 Recent iterations）挂载即 GET 生成列表
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  /**
   * L1: 排队降级（>60s）。
   * 旧 UI 的“Analysis is queued”提示卡（RecipeStep/RecipeEditor）已随三栏重构移除；
   * 60s 排队计时逻辑仍在（useEffect + QUEUEING_THRESHOLD_MS），现行可观察呈现是
   * 生成任务弹窗内的排队提示，故保留 fake-clock 触发方式并断言该等价行为。
   */
  test('L1 排队：60秒后任务弹窗展示排队提示', async ({ page }) => {
    const generationTaskId = 'degradation-queueing-generation-task'
    await mockGenerationCreate(page, generationTaskId)
    await mockGenerationPolling(page, generationTaskId, {
      id: generationTaskId,
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    // Install fake clock（保持真实走时），保留 60s 阈值的快进触发方式
    await page.clock.install()

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-queueing-analysis-task',
    })

    await generateButton(page).click()

    const dialog = page.getByTestId('generation-dialog')
    await expect(page.getByRole('dialog', { name: 'Generation Task' })).toBeVisible()
    await expect(dialog).toContainText('Generating image...', { timeout: 15000 })

    // Fast-forward 61 seconds to trigger the L1 queueing hint
    await page.clock.fastForward(61000)

    await expect(dialog).toContainText('Generation is queued. Thanks for waiting')
  })

  // L2: Generation unavailable
  test('L2 生成不可用：错误提示 + 按钮 disabled + Prompt 可用', async ({ page }) => {
    await mockApiError(page, '**/api/generation', 500, SERVICE_UNAVAILABLE_BODY)

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-l2-analysis-task',
    })
    await expect(generateButton(page)).toBeEnabled()

    await generateButton(page).click()

    // 生成任务弹窗以三段式呈现失败：发生了什么 / 保留了什么 / 下一步
    const dialog = page.getByTestId('generation-dialog')
    await expect(dialog).toContainText('Generation Failed', { timeout: 15000 })
    await expect(dialog).toContainText('Service Temporarily Unavailable')
    await expect(dialog).toContainText('are preserved')

    // 返回编辑态：Render Dock 因 generationUnavailable 降级为不可生成
    await page.getByRole('button', { name: 'Back to Edit' }).click()
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    await expect(renderDock(page)).toHaveAttribute('data-readiness-can-generate', 'false')
    await expect(generateButton(page)).toBeDisabled()
    await expect(generateButton(page)).toHaveAttribute(
      'title',
      'Generation service is temporarily unavailable. Retry service when ready.',
    )

    // AI 状态带标记服务降级：failure phase + Services Limited
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'failure')
    await expect(page.getByTestId('ai-copilot-ribbon')).toHaveAttribute(
      'data-service',
      'limited',
    )
    await expect(page.getByTestId('ai-copilot-ribbon')).toContainText('Limited')

    // Prompt 编辑器仍可用（上下文保留）
    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(promptCard.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(promptCard.getByLabel('Full Generation Prompt')).toBeEditable()
  })

  // L3: LLM degradation (structuring fallback)
  test('L3 LLM 降级：Prompt 降级提示 + 预填原始分析文本', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-l3-analysis-task',
      analysisResponse: loadFixture('analysis-degraded.json'),
    })

    // LLM 结构化失败 → analysisTemplateStatus=fallback，Prompt 编辑器展示降级提示及原因
    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(
      promptCard.getByText('No stable replaceable variables were detected this time.'),
    ).toBeVisible({ timeout: 15000 })
    await expect(promptCard.getByTestId('unified-prompt-editor')).toContainText(
      'Structure analysis failed: Invalid JSON',
    )

    // Prompt 预填原始视觉分析文本，仍可直接编辑/生成
    const promptTextarea = promptCard.getByLabel('Full Generation Prompt')
    await expect(promptTextarea).toHaveValue(/Raw visual analysis/)
    await expect(promptTextarea).toBeEditable()
    await expect(generateButton(page)).toBeEnabled()
  })

  // L4: Analysis unavailable
  test('L4 分析不可用：错误提示展示', async ({ page }) => {
    await mockUploadPresign(page)
    await mockApiError(page, '**/api/analysis', 500, {
      error: 'Analysis is temporarily unavailable. Please try again later.',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await gotoWorkspace(page)
    const referenceInput = referenceColumn(page).locator('input[type="file"]')
    await waitForReactInput(referenceInput)
    await referenceInput.setInputFiles(TEST_IMAGE_PATH)

    // Reference Canvas 以三段式呈现失败：发生了什么 / 保留了什么 / 下一步（Retry）
    const referenceCard = referenceColumn(page).getByTestId('reference-card')
    await expect(referenceCard.getByText('Analysis failed')).toBeVisible({ timeout: 15000 })
    await expect(
      referenceCard.getByText('Analysis is temporarily unavailable. Please try again later.'),
    ).toBeVisible()
    await expect(referenceCard.getByText(/Reference context preserved/)).toBeVisible()
    await expect(referenceCard.getByRole('button', { name: 'Retry analysis' })).toBeVisible()

    // AI 状态带标记服务降级：failure phase + Services Limited
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'failure')
    await expect(page.getByTestId('ai-copilot-ribbon')).toHaveAttribute(
      'data-service',
      'limited',
    )
  })

  // Analysis error retry
  test('分析错误Retry：错误卡片Retry后重新发起分析并恢复', async ({ page }) => {
    await mockUploadPresign(page)

    const taskId = 'degradation-retry-analysis-task'
    const analysisCompleted = loadFixture('analysis-completed.json')
    let analysisCallCount = 0
    await page.route('**/api/analysis', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      analysisCallCount += 1
      if (analysisCallCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Analysis is temporarily unavailable. Please try again later.',
            code: 'SERVICE_UNAVAILABLE',
            retryable: true,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: taskId, status: 'pending' }),
      })
    })
    await mockAnalysisPolling(page, taskId, analysisCompleted)

    await gotoWorkspace(page)
    const referenceInput = referenceColumn(page).locator('input[type="file"]')
    await waitForReactInput(referenceInput)
    await referenceInput.setInputFiles(TEST_IMAGE_PATH)

    // 首次分析失败：Reference Canvas 展示失败卡片
    const referenceCard = referenceColumn(page).getByTestId('reference-card')
    await expect(referenceCard.getByText('Analysis failed')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('ai-copilot-ribbon')).toHaveAttribute(
      'data-service',
      'limited',
    )

    // Retry 重新发起分析（第二次 POST 成功）并恢复到 analysis_ready
    await referenceCard.getByRole('button', { name: 'Retry analysis' }).click()

    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'analysis_ready',
      { timeout: 15000 },
    )
    await expect(page.getByTestId('ai-copilot-ribbon')).toHaveAttribute(
      'data-service',
      'ready',
    )
    await expect(promptColumn(page).getByLabel('Full Generation Prompt')).not.toBeEmpty()
    expect(analysisCallCount).toBe(2)
  })

  // Generation error retry
  test('生成错误Retry：失败弹窗Retry后错误清除', async ({ page }) => {
    let generationPostCount = 0
    await page.route('**/api/generation', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      generationPostCount += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify(SERVICE_UNAVAILABLE_BODY),
      })
    })

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'degradation-generation-retry-analysis-task',
    })
    await generateButton(page).click()

    // 生成任务弹窗展示失败（发生了什么 / 保留了什么 / 下一步）
    const dialog = page.getByTestId('generation-dialog')
    await expect(dialog).toContainText('Generation Failed', { timeout: 15000 })
    await expect(dialog).toContainText('Service Temporarily Unavailable')
    await expect(renderDock(page)).toHaveAttribute('data-readiness-can-generate', 'false')

    // SERVICE_UNAVAILABLE 的 Retry 仅恢复服务（清错误 + 解除降级），不自动重新发起生成
    await dialog.getByRole('button', { name: 'Regenerate' }).click()

    await expect(dialog.getByText('Generation Failed')).toHaveCount(0)
    await expect(dialog.getByText('Service Temporarily Unavailable')).toHaveCount(0)
    await expect(renderDock(page)).toHaveAttribute('data-readiness-can-generate', 'true')
    await expect(generateButton(page)).toBeEnabled()
    expect(generationPostCount).toBe(1)
  })
})
