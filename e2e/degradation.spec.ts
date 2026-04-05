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

test.describe('Degradation', () => {
  test('L1 分析排队提示', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'

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

    await page.goto('/workspace')

    // Install fake clock to fast-forward time
    await page.clock.install()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Wait for analysis to start
    await expect(page.getByText('AI 正在分析图片风格...')).toBeVisible({ timeout: 15000 })

    // Fast-forward 61 seconds to trigger L1 queueing
    await page.clock.fastForward(61000)

    // Should show queueing hint
    await expect(page.getByText('分析排队中，请耐心等待')).toBeVisible({ timeout: 5000 })
  })

  test('L1 生成排队提示', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const genTaskId = 'mock-generation-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)
    await mockGenerationCreate(page, genTaskId)

    // Mock generation polling always returns processing
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

    await page.goto('/workspace')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('Step 1')).toBeVisible({ timeout: 15000 })

    // Install clock before generate
    await page.clock.install()

    // Click generate
    await page.getByRole('button', { name: '生成首版' }).click()

    // Wait for generation progress
    await expect(page.getByText('正在生成图片...')).toBeVisible({ timeout: 15000 })

    // Fast-forward 61 seconds
    await page.clock.fastForward(61000)

    // Should show generation queueing hint
    await expect(page.getByText('生成排队中，请耐心等待')).toBeVisible({ timeout: 5000 })
  })

  test('L2 生成服务不可用', async ({ page }) => {
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
    await expect(page.getByText('Step 1')).toBeVisible({ timeout: 15000 })

    // Click generate
    await page.getByRole('button', { name: '生成首版' }).click()

    // Should show L2 degradation message
    await expect(page.getByText('服务暂时不可用').first()).toBeVisible({ timeout: 15000 })
  })

  test('L2 降级后保留分析和编辑', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)
    await mockApiError(page, '**/api/generation', 500, {
      error: '服务暂时不可用',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('Step 1')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: '生成首版' }).click()
    await expect(page.getByText('服务暂时不可用').first()).toBeVisible({ timeout: 15000 })

    // Recipe step should still be visible
    await expect(page.getByText('Step 1')).toBeVisible()

    // Prompt editor should still be usable — use heading selector to avoid matching degradation message
    await expect(page.getByRole('heading', { name: 'Prompt 编辑' })).toBeVisible()
    const promptTextarea = page.locator('#prompt-text')
    await expect(promptTextarea).not.toBeDisabled()
  })

  test('L3 LLM 失败降级展示', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'
    const analysisDegraded = loadFixture('analysis-degraded.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, analysisDegraded)

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Should show L3 degradation message
    await expect(
      page.getByText('AI 结构化处理失败，已降级为原始分析结果'),
    ).toBeVisible({ timeout: 15000 })

    // Prompt editor should show the raw analysis text
    const promptTextarea = page.locator('#prompt-text')
    await expect(promptTextarea).toHaveValue(/Raw visual analysis/)

    // Recipe summary should NOT be shown (recipe is null), but Step 1 heading is still visible
    // In the new layout, RecipeStep shows the degradation hint but no recipe summary fields
    await expect(page.getByText('主体')).not.toBeVisible()
  })

  test('L3 降级后仍可编辑和生成', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'
    const genTaskId = 'mock-generation-task-id'
    const analysisDegraded = loadFixture('analysis-degraded.json')
    const generationCompleted = loadFixture('generation-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, analysisDegraded)
    await mockGenerationCreate(page, genTaskId)
    await mockGenerationPolling(page, genTaskId, generationCompleted)

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Wait for L3 degradation
    await expect(
      page.getByText('AI 结构化处理失败，已降级为原始分析结果'),
    ).toBeVisible({ timeout: 15000 })

    // Edit prompt
    const promptTextarea = page.locator('#prompt-text')
    await promptTextarea.fill('Manually edited prompt for generation')

    // Click generate
    await page.getByRole('button', { name: '生成首版' }).click()

    // Should successfully generate
    await expect(page.locator('h3').filter({ hasText: /^生成结果$/ })).toBeVisible({ timeout: 15000 })
  })

  test('L4 分析服务不可用', async ({ page }) => {
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

    // Should show error display (SERVICE_UNAVAILABLE triggers ErrorDisplay with title "服务暂时不可用")
    await expect(
      page.getByText('服务暂时不可用').first(),
    ).toBeVisible({ timeout: 15000 })
  })
})
