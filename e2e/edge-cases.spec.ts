import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import {
  mockUploadPresign,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockGenerationCreate,
  mockGenerationPolling,
  loadFixture,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

test.describe('Edge Cases', () => {
  test('替换参考图清空结果', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const genTaskId = 'mock-generation-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')
    const generationCompleted = loadFixture('generation-completed.json')

    // Setup all mocks
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)
    await mockGenerationCreate(page, genTaskId)
    await mockGenerationPolling(page, genTaskId, generationCompleted)

    // Complete full flow
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' }).click()
    await expect(page.locator('h3').filter({ hasText: /^生成结果$/ })).toBeVisible({ timeout: 15000 })
    await page.getByText('关闭弹窗', { exact: true }).click()

    // Click "更换参考图"
    const replaceBtn = page.getByRole('button', { name: '更换参考图' })
    await expect(replaceBtn).toBeVisible()
    await replaceBtn.click()

    // Results should be cleared — back to idle state with drop zone
    await expect(page.getByText('点击或拖拽上传参考图')).toBeVisible({ timeout: 5000 })

    // Recipe and generation result should be gone
    await expect(page.getByText('可生成', { exact: true })).not.toBeVisible()
    await expect(page.locator('h3').filter({ hasText: /^生成结果$/ })).not.toBeVisible()
  })

  test('分析中刷新页面回到 idle', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)

    // Mock polling returning processing (never completes)
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
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Wait for analysis progress indicator
    await expect(page.getByText('AI 正在分析图片风格...')).toBeVisible({ timeout: 15000 })

    // Refresh the page
    await page.reload()

    // Should be back to idle state
    await expect(page.getByText('点击或拖拽上传参考图')).toBeVisible({ timeout: 10000 })
  })

  test('快速连续点击生成只发一次请求', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const genTaskId = 'mock-generation-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)

    // Track generation POST calls
    let generationPostCount = 0
    await page.route('**/api/generation', async (route) => {
      if (route.request().method() === 'POST') {
        generationPostCount++
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: genTaskId, status: 'pending' }),
        })
      } else {
        await route.continue()
      }
    })

    // Mock generation polling (stays processing)
    await mockGenerationPolling(page, genTaskId, {
      id: genTaskId,
      status: 'processing',
      analysisTaskId,
      promptSnapshot: 'test',
      negativePromptSnapshot: '',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'flux.2',
      resultAssetId: null,
      resultFileUrl: null,
      errorMessage: null,
    })

    // Upload and wait for analysis
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })

    // Click generate button rapidly
    const generateBtn = page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' })
    await generateBtn.click()
    // After first click, button changes to "GENERATING..." and is disabled
    // So subsequent clicks should not go through
    await expect(page.getByRole('button', { name: 'GENERATING...' })).toBeDisabled()

    // Only 1 POST request should have been made
    expect(generationPostCount).toBe(1)
  })
})
