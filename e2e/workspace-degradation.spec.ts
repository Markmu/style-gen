import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import {
  mockUploadPresign,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockGenerationCreate,
  mockGenerationPolling,
  mockApiError,
  loadFixture,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

test.describe('Workspace Degradation Scenarios', () => {
  // L1: Analysis queueing
  test('L1 分析排队：60秒后展示排队提示卡', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)

    // Mock polling always returns processing
    await mockAnalysisPolling(page, taskId, {
      id: taskId,
      status: 'processing',
      recipe: null,
      promptText: null,
      negativePromptText: null,
      errorMessage: null,
      errorStage: null,
    })

    await page.goto('/workspace')

    // Install fake clock to fast-forward time
    await page.clock.install()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Wait for analysis to start
    await expect(page.getByText('AI 正在分析图片风格...')).toBeVisible({ timeout: 15000 })

    // Fast-forward 61 seconds to trigger L1 queueing
    await page.clock.fastForward(61000)

    // Verify RecipeStep area shows queueing hint card
    await expect(page.getByText('分析排队中，请耐心等待')).toBeVisible({ timeout: 5000 })

    // Verify hint card includes spinner (animate-spin element)
    const spinner = page.locator('.animate-spin')
    await expect(spinner).toBeVisible()
  })

  // L2: Generation unavailable
  test('L2 生成不可用：错误提示 + 按钮 disabled + Prompt 可用', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)

    // Mock generation POST returning SERVICE_UNAVAILABLE
    await mockApiError(page, '**/api/generation', 500, {
      error: '服务暂时不可用',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })

    // Click generate to trigger L2
    await page.getByRole('button', { name: '生成首版' }).click()

    // Verify OutputSettings area shows error display (SERVICE_UNAVAILABLE triggers ErrorDisplay)
    await expect(page.getByText('服务暂时不可用').first()).toBeVisible({ timeout: 15000 })

    // Verify generate button is disabled (generationUnavailable blocks it)
    const genBtn = page.getByRole('button', { name: '重新生成' })
    await expect(genBtn).toBeDisabled()

    // Verify Prompt editor is still usable
    await expect(page.getByRole('heading', { name: 'Prompt 编辑' })).toBeVisible()
    const promptTextarea = page.locator('#prompt-text')
    await expect(promptTextarea).not.toBeDisabled()
  })

  // L3: LLM degradation
  test('L3 LLM 降级：amber 降级提示卡 + Prompt 预填原始分析文本', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'
    const analysisDegraded = loadFixture('analysis-degraded.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, analysisDegraded)

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Verify RecipeStep area shows amber degradation hint
    await expect(
      page.getByText('AI 结构化处理失败，已降级为原始分析结果'),
    ).toBeVisible({ timeout: 15000 })

    // Verify Prompt editor is pre-filled with raw analysis text
    const promptTextarea = page.locator('#prompt-text')
    await expect(promptTextarea).toHaveValue(/Raw visual analysis/)
  })

  // L4: Analysis unavailable
  test('L4 分析不可用：错误提示展示', async ({ page }) => {
    await mockUploadPresign(page)

    // Mock analysis POST returning SERVICE_UNAVAILABLE
    await mockApiError(page, '**/api/analysis', 500, {
      error: '分析服务暂时不可用',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // failAnalysis sets error with SERVICE_UNAVAILABLE code, which renders ErrorDisplay
    // ErrorDisplay maps SERVICE_UNAVAILABLE to title "服务暂时不可用"
    await expect(
      page.getByText('服务暂时不可用').first(),
    ).toBeVisible({ timeout: 15000 })
  })

  // Analysis error retry
  test('分析错误重试：ErrorDisplay + 重试后重新发起分析', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)

    // Mock CDN image for retry
    await page.route('https://cdn.example.com/**', async (route) => {
      if (route.request().resourceType() === 'image' || route.request().url().match(/\.(png|jpg|webp)$/)) {
        const pixel = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'
        )
        await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      } else {
        await route.continue()
      }
    })

    // First analysis call fails, second succeeds
    let analysisCallCount = 0
    await page.route('**/api/analysis', async (route) => {
      if (route.request().method() === 'POST') {
        analysisCallCount++
        if (analysisCallCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: '服务暂时不可用',
              code: 'SERVICE_UNAVAILABLE',
              retryable: true,
            }),
          })
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: taskId, status: 'pending' }),
          })
        }
      } else {
        await route.continue()
      }
    })

    await mockAnalysisPolling(page, taskId, analysisCompleted)

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Verify RecipeStep area shows ErrorDisplay
    await expect(page.getByText('服务暂时不可用').first()).toBeVisible({ timeout: 15000 })

    // Click retry
    const retryBtn = page.getByRole('button', { name: '重试' })
    await expect(retryBtn).toBeVisible()
    await retryBtn.click()

    // Verify re-analysis is triggered and completes
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })
    expect(analysisCallCount).toBe(2)
  })

  // Generation error retry
  test('生成错误重试：ErrorDisplay + 重试后错误清除', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)

    // Mock generation POST fails
    await mockApiError(page, '**/api/generation', 500, {
      error: '服务暂时不可用',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })

    // Click generate
    await page.getByRole('button', { name: '生成首版' }).click()

    // Verify OutputSettings area shows ErrorDisplay
    await expect(page.getByText('服务暂时不可用').first()).toBeVisible({ timeout: 15000 })

    // Click retry (generation retry clears both error and generationUnavailable flag)
    const retryBtn = page.getByRole('button', { name: '重试' })
    await expect(retryBtn).toBeVisible()
    await retryBtn.click()

    // Verify error is cleared — the ErrorDisplay should disappear
    // onGenerateRetry calls clearError() and setGenerationUnavailable(false)
    await expect(page.getByText('服务暂时不可用').first()).not.toBeVisible({ timeout: 5000 })
  })
})
