import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAnalysisPolling,
  mockApiError,
  mockGenerationPolling,
  mockGenerationPollingSequence,
  mockUploadPresign,
} from './helpers/mock-api'
import {
  completeFullFlow,
  gotoWorkspace,
  TEST_IMAGE_PATH,
  uploadAndCompleteAnalysis,
  uploadAndStartAnalysis,
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

test.describe('Workspace Layout & State Flow', () => {
  test('空态进入：两栏布局 + 状态栏 + 上传入口', async ({ page }) => {
    await gotoWorkspace(page)

    await expect(page.getByTestId('workspace-two-pane-layout')).toBeVisible()
    await expect(page.getByTestId('analysis-pane')).toBeVisible()
    await expect(page.getByTestId('editing-pane')).toBeVisible()
    await expect(page.getByText('Not Started')).toBeVisible()
    await expect(page.getByText('Click or drag to upload a reference image')).toBeVisible()
    await expect(page.getByTestId('reference-preview')).toContainText('Image')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Analyze')
    await expect(page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' })).toBeDisabled()
  })

  test('Analyzing状态展示进度', async ({ page }) => {
    await uploadAndStartAnalysis(page, { analysisTaskId: 'layout-processing-task' })

    await expect(page.getByText('Analyzing', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('AI is analyzing the image style...')).toBeVisible()
  })

  test('上传并分析后展示风格拆解、统一 Prompt 编辑器和生成按钮', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'layout-ready-task' })

    await expect(page.getByText('Ready to Generate')).toBeVisible()
    await expect(page.getByAltText('Reference')).toBeVisible()
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Subject')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Style')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Lighting')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Composition')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Image Summary')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Visual Keywords')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Must Keep')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Replaceable')
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(page.getByLabel('Full Generation Prompt')).not.toBeEmpty()
    await expect(page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' })).toBeEnabled()
  })

  test('生成图片：弹窗进度、结果图、关闭后保留上下文', async ({ page }) => {
    await mockCdnImages(page)
    await page.route('**/api/generation', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'layout-generation-task', status: 'pending' }),
        })
        return
      }
      await route.continue()
    })
    await mockGenerationPollingSequence(page, 'layout-generation-task', [
      { id: 'layout-generation-task', status: 'processing', resultFileUrl: null, errorMessage: null },
      { ...loadFixture('generation-completed.json'), id: 'layout-generation-task' },
    ])

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'layout-generation-analysis-task' })
    await page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' }).click()

    await expect(page.getByRole('dialog', { name: 'Generation Task' })).toBeVisible()
    await expect(page.getByText('Generating image...')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('generation-dialog')).toContainText('Generated Result', { timeout: 15000 })
    await page.getByText('Close Dialog', { exact: true }).click()

    await expect(page.getByText('Done')).toBeVisible()
    await expect(page.getByTestId('workspace-two-pane-layout')).toBeVisible()
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' })).toBeVisible()
  })

  test('迭代重新生成会发送修改后的 Prompt', async ({ page }) => {
    await mockCdnImages(page)
    let generationPostCount = 0
    let capturedPrompt = ''

    await page.route('**/api/generation', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      generationPostCount += 1
      const taskId =
        generationPostCount === 1
          ? 'layout-generation-first-task'
          : 'layout-generation-second-task'
      const body = route.request().postDataJSON() as { promptText?: string }
      capturedPrompt = body.promptText ?? ''
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: taskId, status: 'pending' }),
      })
    })

    await mockGenerationPolling(page, 'layout-generation-first-task', {
      ...loadFixture('generation-completed.json'),
      id: 'layout-generation-first-task',
    })
    await mockGenerationPolling(page, 'layout-generation-second-task', {
      ...loadFixture('generation-completed.json'),
      id: 'layout-generation-second-task',
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'layout-iteration-analysis-task' })
    await page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' }).click()
    await expect(page.getByTestId('generation-dialog')).toContainText('Generated Result', { timeout: 15000 })
    await page.getByText('Close Dialog', { exact: true }).click()

    await page.getByLabel('Full Generation Prompt').fill('A vibrant sunrise over the mountains with mist')
    await page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' }).click()

    await expect(page.getByTestId('generation-dialog')).toContainText('Generated Result', { timeout: 15000 })
    expect(capturedPrompt).toBe('A vibrant sunrise over the mountains with mist')
  })

  test('Replace Reference会重置Workspace状态', async ({ page }) => {
    await mockCdnImages(page)
    await completeFullFlow(page, { generationTaskId: 'layout-reset-generation-task' })
    await page.getByText('Close Dialog', { exact: true }).click()

    await page.getByRole('button', { name: 'Replace Reference' }).click()

    await expect(page.getByText('Click or drag to upload a reference image')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Not Started')).toBeVisible()
    await expect(page.getByText('Ready to Generate', { exact: true })).not.toBeVisible()
    await expect(page.getByTestId('style-breakdown-panel')).not.toContainText('Subject')
  })

  test('分析失败后可以Retry并恢复到Ready to Generate状态', async ({ page }) => {
    await mockCdnImages(page)
    await mockUploadPresign(page)

    const taskId = 'layout-retry-analysis-task'
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
            error: 'Vision Analysis Failed',
            code: 'VISION_FAILED',
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
    const chooserPromise = page.waitForEvent('filechooser')
    await page.getByText('Click or drag to upload a reference image').click()
    const chooser = await chooserPromise
    await chooser.setFiles(TEST_IMAGE_PATH)

    await expect(page.getByText('Vision Analysis Failed').first()).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('Ready to Generate')).toBeVisible({ timeout: 15000 })
  })

  test('Generation Failed后保留 Prompt 和编辑上下文', async ({ page }) => {
    await mockApiError(page, '**/api/generation', 500, {
      error: 'Service Temporarily Unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'layout-generation-error-analysis-task' })
    await page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' }).click()

    await expect(page.getByRole('dialog', { name: 'Generation Task' })).toContainText('Generation Failed', { timeout: 15000 })
    await expect(page.getByText('Service Temporarily Unavailable').first()).toBeVisible()
    await page.getByRole('button', { name: 'Back to Edit' }).click()
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(page.getByLabel('Full Generation Prompt')).not.toBeEmpty()
    await expect(page.getByLabel('Full Generation Prompt')).not.toBeDisabled()
  })
})
