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
import { mockAuthSession } from './mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, '../fixtures/test-image.png')

/** Next dev can keep navigation open; E2E only needs the app shell committed. */
export async function gotoWorkspace(page: Page) {
  try {
    await page.goto('/workspace', { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }
  await page.getByTestId('workspace-three-column-layout').first().waitFor({ timeout: 15000 })
}

/** Upload a test image in the workspace and wait for analysis to start */
export async function uploadAndStartAnalysis(
  page: Page,
  options?: {
    analysisTaskId?: string
    assetId?: string
    mockPolling?: boolean
  },
) {
  const taskId = options?.analysisTaskId ?? 'mock-analysis-task-id'
  const assetId = options?.assetId ?? 'mock-asset-id'

  // Setup mocks
  await mockAuthSession(page)
  await mockUploadPresign(page, assetId)
  await mockAnalysisCreate(page, taskId)
  if (options?.mockPolling !== false) {
    await mockAnalysisPolling(page, taskId, {
      id: taskId,
      status: 'processing',
      recipe: null,
      promptText: null,
      negativePromptText: null,
      errorMessage: null,
      errorStage: null,
    })
  }

  // Navigate to workspace
  await gotoWorkspace(page)
  await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 10000 })
  await page.waitForTimeout(300)

  // Upload file through the visible drop-zone so React's click handler is active.
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByText('Click or drag to upload a reference image').click()
  const chooser = await chooserPromise
  await chooser.setFiles(TEST_IMAGE_PATH)

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
  const responseWithTaskId = { ...response, id: taskId }

  // Mock analysis polling to return completed
  await mockAuthSession(page)
  await mockAnalysisPolling(page, taskId, responseWithTaskId)

  // Upload and start analysis
  const result = await uploadAndStartAnalysis(page, {
    analysisTaskId: taskId,
    assetId: options?.assetId,
    mockPolling: false,
  })

  await page
    .locator('[data-testid="ai-status-header"][data-phase="analysis_ready"]')
    .waitFor({ timeout: 15000 })
  await page
    .locator('[data-testid="unified-prompt-editor"], [data-testid="structured-prompt-editor"]')
    .first()
    .waitFor({ timeout: 15000 })

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
  const genResponseWithTaskId = { ...genResponse, id: genTaskId }

  // Setup generation mocks
  await mockAuthSession(page)
  await mockGenerationCreate(page, genTaskId)
  await mockGenerationPolling(page, genTaskId, genResponseWithTaskId)

  // Complete analysis
  const result = await uploadAndCompleteAnalysis(page)

  const generateBtn = page
    .getByTestId('output-card')
    .getByRole('button', { name: /^Generate$/i })
  await generateBtn.click()

  await page.getByTestId('generation-dialog').getByText('Generated Result').waitFor({ timeout: 15000 })

  return { ...result, generationTaskId: genTaskId }
}

export { TEST_IMAGE_PATH }
