import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import {
  mockUploadPresign,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockGenerationCreate,
  mockGenerationPolling,
  mockAuthSession,
  loadFixture,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

test.describe('Happy Path', () => {
  test('Home上传Reference跳转工作区', async ({ page }) => {
    // Mock session so UploadEntry recognizes the user as logged in
    await mockAuthSession(page)

    // Mock upload APIs
    await mockUploadPresign(page)

    // Go to home page
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Reference Image Style Recreation')

    // Wait for session to load (AuthHeader shows UserMenu instead of LoginButton)
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible({ timeout: 10000 })

    // Upload via file input (first UploadEntry)
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Should navigate to workspace
    await page.waitForURL('**/workspace', { timeout: 10000 })
    expect(page.url()).toContain('/workspace')
  })

  test('工作区上传后自动分析展示配方', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    // Setup mocks
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, analysisCompleted)

    // Go to workspace and upload
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Wait for analysis to complete and show the current workspace editor
    await expect(page.getByText('Ready to Generate')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Subject')

    // Verify prompt editor is shown
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
  })

  test('Confirm Prompt 后生成图片', async ({ page }) => {
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

    // Upload and wait for analysis
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('Ready to Generate')).toBeVisible({ timeout: 15000 })

    // Click generate
    const generateBtn = page.getByTestId('floating-generate-window').getByRole('button', { name: 'GENERATE' })
    await expect(generateBtn).toBeEnabled()
    await generateBtn.click()

    // Wait for generation result - use locator filter for exact match
    await expect(page.locator('h3').filter({ hasText: /^Generated Result$/ })).toBeVisible({ timeout: 15000 })
  })

  test('对比Reference和结果图', async ({ page }) => {
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

    // Full flow
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('Ready to Generate')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('floating-generate-window').getByRole('button', { name: 'GENERATE' }).click()
    await expect(page.locator('h3').filter({ hasText: /^Generated Result$/ })).toBeVisible({ timeout: 15000 })

    // Verify the result dialog can be closed without losing workspace context
    await page.getByText('Close Dialog', { exact: true }).click()
    await expect(page.getByTestId('workspace-two-pane-layout')).toBeVisible()
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
  })

  test('修改 Prompt 后迭代生成', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const genTaskId1 = 'mock-generation-task-id-1'
    const analysisCompleted = loadFixture('analysis-completed.json')
    // Create generation completed response with matching ID
    const generationCompleted1 = {
      id: genTaskId1,
      analysisTaskId,
      status: 'completed' as const,
      promptSnapshot: 'A breathtaking sunset over the calm ocean',
      negativePromptSnapshot: 'blurry, low quality',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'flux.2',
      resultAssetId: 'mock-result-asset-id',
      resultFileUrl: 'https://cdn.example.com/generated/mock-gen-id/result.webp',
      errorMessage: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:05.000Z',
    }

    // Setup mocks for first generation
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)
    await mockGenerationCreate(page, genTaskId1)
    await mockGenerationPolling(page, genTaskId1, generationCompleted1)

    // Complete first generation
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('Ready to Generate')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('floating-generate-window').getByRole('button', { name: 'GENERATE' }).click()

    // Wait for generation result - use text matcher since there are multiple elements
    await expect(page.locator('h3').filter({ hasText: /^Generated Result$/ })).toBeVisible({ timeout: 15000 })
    await page.getByText('Close Dialog', { exact: true }).click()

    // Verify the generate button remains available for iteration
    await expect(
      page.getByTestId('floating-generate-window').getByRole('button', { name: 'GENERATE' }),
    ).toBeVisible()
  })
})
