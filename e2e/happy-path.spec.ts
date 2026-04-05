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
  test('首页上传参考图跳转工作区', async ({ page }) => {
    // Mock session so UploadEntry recognizes the user as logged in
    await mockAuthSession(page)

    // Mock upload APIs
    await mockUploadPresign(page)

    // Go to home page
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('参考图风格再创作')

    // Wait for session to load (AuthHeader shows UserMenu instead of LoginButton)
    await expect(page.getByRole('button', { name: '用户菜单' })).toBeVisible({ timeout: 10000 })

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

    // Wait for analysis to complete and show recipe step
    await expect(page.getByText('Step 1')).toBeVisible({ timeout: 15000 })

    // Verify prompt editor is shown
    await expect(page.getByRole('heading', { name: 'Prompt 编辑' })).toBeVisible()
  })

  test('确认 Prompt 后生成图片', async ({ page }) => {
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
    await expect(page.getByText('Step 1')).toBeVisible({ timeout: 15000 })

    // Click generate
    const generateBtn = page.getByRole('button', { name: '生成首版' })
    await expect(generateBtn).toBeEnabled()
    await generateBtn.click()

    // Wait for generation result - use locator filter for exact match
    await expect(page.locator('h3').filter({ hasText: /^生成结果$/ })).toBeVisible({ timeout: 15000 })
  })

  test('对比参考图和结果图', async ({ page }) => {
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
    await expect(page.getByText('Step 1')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: '生成首版' }).click()
    await expect(page.locator('h3').filter({ hasText: /^生成结果$/ })).toBeVisible({ timeout: 15000 })

    // Verify comparison view
    await expect(page.getByText('参考图 vs 生成结果')).toBeVisible()
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
    await expect(page.getByText('Step 1')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: '生成首版' }).click()

    // Wait for generation result - use text matcher since there are multiple elements
    await expect(page.locator('h3').filter({ hasText: /^生成结果$/ })).toBeVisible({ timeout: 15000 })

    // Verify "重新生成" button is now visible
    await expect(page.getByRole('button', { name: '重新生成' })).toBeVisible()
  })
})
