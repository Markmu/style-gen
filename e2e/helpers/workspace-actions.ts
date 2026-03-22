import type { Page } from '@playwright/test'
import { resolve } from 'path'
import {
  mockUploadPresign,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockGenerationCreate,
  mockGenerationPolling,
  loadFixture,
} from './mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, '../fixtures/test-image.png')

/** Upload a test image in the workspace and wait for analysis to start */
export async function uploadAndStartAnalysis(
  page: Page,
  options?: {
    analysisTaskId?: string
    assetId?: string
  },
) {
  const taskId = options?.analysisTaskId ?? 'mock-analysis-task-id'
  const assetId = options?.assetId ?? 'mock-asset-id'

  // Setup mocks
  await mockUploadPresign(page, assetId)
  await mockAnalysisCreate(page, taskId)

  // Navigate to workspace
  await page.goto('/workspace')

  // Upload file via file input
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(TEST_IMAGE_PATH)

  return { taskId, assetId }
}

/** Complete upload + analysis flow, arriving at analysis_ready state */
export async function uploadAndCompleteAnalysis(
  page: Page,
  options?: {
    analysisTaskId?: string
    assetId?: string
    analysisResponse?: object
  },
) {
  const taskId = options?.analysisTaskId ?? 'mock-analysis-task-id'
  const response =
    options?.analysisResponse ?? loadFixture('analysis-completed.json')

  // Mock analysis polling to return completed
  await mockAnalysisPolling(page, taskId, response)

  // Upload and start analysis
  const result = await uploadAndStartAnalysis(page, {
    analysisTaskId: taskId,
    assetId: options?.assetId,
  })

  // Wait for analysis to complete — recipe card should appear
  await page.waitForSelector('text=视觉配方', { timeout: 15000 })

  return result
}

/** Complete full flow: upload → analysis → generation */
export async function completeFullFlow(
  page: Page,
  options?: {
    generationTaskId?: string
    generationResponse?: object
  },
) {
  const genTaskId = options?.generationTaskId ?? 'mock-generation-task-id'
  const genResponse =
    options?.generationResponse ?? loadFixture('generation-completed.json')

  // Setup generation mocks
  await mockGenerationCreate(page, genTaskId)
  await mockGenerationPolling(page, genTaskId, genResponse)

  // Complete analysis
  const result = await uploadAndCompleteAnalysis(page)

  // Click generate button
  const generateBtn = page.getByRole('button', { name: '生成图片' })
  await generateBtn.click()

  // Wait for generation result
  await page.waitForSelector('text=生成结果', { timeout: 15000 })

  return { ...result, generationTaskId: genTaskId }
}

export { TEST_IMAGE_PATH }
