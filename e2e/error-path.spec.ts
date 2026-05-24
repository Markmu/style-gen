import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import {
  mockUploadPresign,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockApiError,
  mockGenerationCreate,
  mockGenerationPolling,
  loadFixture,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

test.describe('Error Path', () => {
  test('上传不支持的文件类型', async ({ page }) => {
    await page.goto('/workspace')

    // The file input has accept attribute limiting types
    // Playwright setInputFiles bypasses browser accept, but the component validates
    const textFilePath = resolve(__dirname, 'fixtures/test-file.txt')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(textFilePath)

    // Should show error — the file validation in UploadZone rejects non-image types
    // .txt file has type 'text/plain' which is not in ACCEPTED_TYPES
    await expect(page.getByText('Only JPG, PNG, and WebP images are supported')).toBeVisible({ timeout: 5000 })
  })

  test('分析 API 失败展示错误', async ({ page }) => {
    // Mock upload success
    await mockUploadPresign(page)

    // Mock analysis POST returning 500
    await mockApiError(page, '**/api/analysis', 500, {
      error: 'Service Temporarily Unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Should show error display with title (in <p> not heading)
    await expect(page.getByText('Service Temporarily Unavailable').first()).toBeVisible({ timeout: 15000 })
  })

  test('分析失败后Retry', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    // Mock upload
    await mockUploadPresign(page)

    // Mock the CDN image URL so getImageDimensions can load it during retry
    await page.route('https://cdn.example.com/**', async (route) => {
      if (route.request().resourceType() === 'image' || route.request().url().match(/\.(png|jpg|webp)$/)) {
        // Return a 1x1 transparent PNG
        const pixel = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'
        )
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: pixel,
        })
      } else {
        await route.continue()
      }
    })

    // First analysis call fails
    let analysisCallCount = 0
    await page.route('**/api/analysis', async (route) => {
      if (route.request().method() === 'POST') {
        analysisCallCount++
        if (analysisCallCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Service Temporarily Unavailable',
              code: 'SERVICE_UNAVAILABLE',
              retryable: true,
            }),
          })
        } else {
          // Second call succeeds
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: taskId,
              status: 'pending',
            }),
          })
        }
      } else {
        await route.continue()
      }
    })

    // Mock polling for success
    await mockAnalysisPolling(page, taskId, analysisCompleted)

    // Upload
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Wait for error title
    await expect(page.getByText('Service Temporarily Unavailable').first()).toBeVisible({ timeout: 15000 })

    // Click retry
    const retryBtn = page.getByRole('button', { name: 'Retry' })
    await expect(retryBtn).toBeVisible()
    await retryBtn.click()

    // Should eventually show recipe step (analysis completes on retry)
    await expect(page.getByText('Ready to Generate')).toBeVisible({ timeout: 15000 })
  })

  test('生成 API 失败展示错误', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    // Mock upload + analysis success
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)

    // Mock generation POST returning 500
    await mockApiError(page, '**/api/generation', 500, {
      error: 'Service Temporarily Unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    // Upload and wait for analysis
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('Ready to Generate')).toBeVisible({ timeout: 15000 })

    // Click generate
    await page.getByTestId('floating-generate-window').getByRole('button', { name: 'GENERATE' }).click()

    // Should show error title (in <p> not heading)
    await expect(page.getByText('Service Temporarily Unavailable').first()).toBeVisible({ timeout: 15000 })
  })

  test('Generation Failed保留 Prompt 和Retry入口', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)
    await mockApiError(page, '**/api/generation', 500, {
      error: 'Service Temporarily Unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('Ready to Generate')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('floating-generate-window').getByRole('button', { name: 'GENERATE' }).click()
    await expect(page.getByText('Service Temporarily Unavailable').first()).toBeVisible({ timeout: 15000 })

    // Prompt editor should still be visible — use heading selector to avoid matching degradation message
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()

    // Prompt text should be preserved
    const promptTextarea = page.getByLabel('Full Generation Prompt')
    await expect(promptTextarea).not.toBeEmpty()
  })

  test('限流触发展示等待提示', async ({ page }) => {
    // Mock upload success
    await mockUploadPresign(page)

    // Mock analysis POST returning 429
    await page.route('**/api/analysis', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Too many requests. Please try again later.',
            code: 'RATE_LIMITED',
            retryable: true,
          }),
          headers: { 'Retry-After': '60' },
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Should show rate limit error title
    await expect(page.getByText('Too Many Requests').first()).toBeVisible({ timeout: 15000 })
  })
})
