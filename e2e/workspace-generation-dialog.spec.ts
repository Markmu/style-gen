import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAuthSession,
  mockGenerationCreate,
  mockGenerationCreateCapture,
  mockGenerationList,
  mockGenerationPolling,
  mockGenerationPollingSequence,
} from './helpers/mock-api'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

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

/** Render Dock（Prompt and Render 列内的 output-card）是现行生成入口 */
function renderDock(page: Page) {
  return page
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('output-card')
}

function referenceCard(page: Page) {
  return page
    .getByRole('region', { name: 'Reference Canvas column' })
    .getByTestId('reference-card')
}

async function generateFromRenderDock(page: Page) {
  const generateButton = renderDock(page).getByRole('button', { name: /^Generate$/i })
  await expect(generateButton).toBeVisible({ timeout: 15000 })
  await expect(generateButton).toBeEnabled()
  await generateButton.click()
}

test.describe('workspace 09 generation dialog', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('opens a dialog for generation progress and sends an empty negative prompt', async ({ page }) => {
    const create = await mockGenerationCreateCapture(page, 'dialog-progress-task')
    await mockGenerationPolling(page, 'dialog-progress-task', {
      id: 'dialog-progress-task',
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'dialog-progress-analysis-task',
      analysisResponse: { ...loadFixture('analysis-completed.json'), negativePromptText: '' },
    })

    await expect(page.getByLabel(/Negative Prompt/i)).toHaveCount(0)
    await generateFromRenderDock(page)

    await expect(page.getByRole('dialog', { name: 'Generation Task' })).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toContainText(/Generation|queued/)
    await expect.poll(() => create.requests.length).toBeGreaterThan(0)
    expect(create.requests[0].body['negativePromptText']).toBe('')
  })

  test('shows completed result in the dialog and keeps context after close', async ({ page }) => {
    await mockGenerationCreate(page, 'dialog-completed-task')
    await mockGenerationPollingSequence(page, 'dialog-completed-task', [
      { id: 'dialog-completed-task', status: 'processing', resultFileUrl: null, errorMessage: null },
      { ...loadFixture('generation-completed.json'), id: 'dialog-completed-task' },
    ])

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'dialog-completed-analysis-task' })
    await generateFromRenderDock(page)

    await expect(page.getByRole('dialog', { name: 'Generation Task' })).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toContainText('Generated Result', {
      timeout: 15000,
    })
    await page.getByText('Close Dialog', { exact: true }).click()

    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(referenceCard(page).getByAltText('Reference')).toBeVisible()
    await expect(page.getByTestId('recipe-card')).toContainText('Ocean sunset')
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
  })

  test('shows generation failure in the dialog and returns to editing without clearing context', async ({ page }) => {
    await mockGenerationCreate(page, 'dialog-failed-task')
    // 对齐 GET /api/generation/[id] 详情超集（src/app/api/generation/[id]/route.ts）
    await mockGenerationPolling(page, 'dialog-failed-task', {
      id: 'dialog-failed-task',
      analysisTaskId: 'dialog-failed-analysis-task',
      status: 'failed',
      promptSnapshot: 'A breathtaking sunset over the calm ocean',
      negativePromptSnapshot: 'blurry, low quality, distorted, watermark, text',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'flux.2',
      resultAssetId: null,
      resultFileUrl: null,
      errorMessage: 'Generation service temporarily unavailable',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:05.000Z',
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'dialog-failed-analysis-task' })
    await generateFromRenderDock(page)

    await expect(page.getByRole('dialog', { name: 'Generation Task' })).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toContainText('Generation Failed', {
      timeout: 15000,
    })
    await page.getByRole('button', { name: 'Back to Edit' }).click()

    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(referenceCard(page).getByAltText('Reference')).toBeVisible()
    await expect(page.getByTestId('recipe-card')).toContainText('Ocean sunset')
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
  })
})
