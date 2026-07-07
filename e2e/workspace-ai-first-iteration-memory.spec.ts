import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockApiError,
  mockAuthSession,
  mockGenerationCreate,
  mockGenerationDetail,
  mockGenerationList,
  mockGenerationListSequence,
  mockGenerationPolling,
  mockTemplateCreate,
  mockUploadPresign,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = `${process.cwd()}/e2e/fixtures/test-image.png`

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const historyItem = {
  id: 'iteration-memory-history-1',
  resultFileUrl: 'https://cdn.example.com/generated/iteration-memory-history-1/result.webp',
  createdAt: '2024-01-01T00:00:00.000Z',
}

const restoredPrompt =
  'Restored editorial glass prompt with blue rim light, translucent petals, and measured studio shadows.'
const restoredNegativePrompt = 'low quality, blurry, text overlays'
const restoredParams = { aspectRatio: '16:9', quality: 'hd' }
const restoredSourceImageUrl =
  'https://cdn.example.com/references/restored-source-asset/original.png'
const restoredVariables = [
  {
    name: 'subject',
    defaultValue: 'Ocean sunset',
    label: 'Subject',
    sourceField: 'subject',
  },
]

function appShell(page: Page) {
  return page.getByTestId('app-shell')
}

function historyStrip(page: Page) {
  return appShell(page).getByTestId('history-strip')
}

function promptCard(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('prompt-card')
}

function renderDock(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('output-card')
}

function styleIntelligence(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Style Intelligence column' })
    .getByTestId('recipe-card')
}

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

async function openWorkspace(page: Page) {
  try {
    await page.goto('/workspace', { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }

  await expect(appShell(page)).toBeVisible({ timeout: 15000 })
}

async function uploadReference(page: Page) {
  await appShell(page)
    .getByRole('region', { name: 'Reference Canvas column' })
    .locator('input[type="file"]')
    .setInputFiles(TEST_IMAGE_PATH)
}

async function openWithCompletedAnalysis(page: Page, taskId: string) {
  await mockUploadPresign(page, 'iteration-memory-reference-asset')
  await mockAnalysisCreate(page, taskId)
  await mockAnalysisPolling(page, taskId, loadFixture('analysis-completed.json'))

  await openWorkspace(page)
  await uploadReference(page)
  await expect(appShell(page).getByTestId('ai-status-header')).toHaveAttribute(
    'data-phase',
    'analysis_ready',
    { timeout: 15000 },
  )
}

async function mockRestoredHistoryDetail(page: Page) {
  const analysis = loadFixture('analysis-completed.json') as {
    recipe: object
  }

  await mockGenerationDetail(page, historyItem.id, {
    analysisTaskId: 'restored-analysis-task',
    status: 'completed',
    promptSnapshot: restoredPrompt,
    negativePromptSnapshot: restoredNegativePrompt,
    params: restoredParams,
    modelName: 'flux.2',
    resultAssetId: 'restored-result-asset',
    resultFileUrl: historyItem.resultFileUrl,
    sourceAssetId: 'restored-source-asset',
    sourceImageUrl: restoredSourceImageUrl,
    variables: restoredVariables,
    analysisTemplateVariables: restoredVariables,
    recipe: analysis.recipe,
    createdAt: historyItem.createdAt,
    updatedAt: historyItem.createdAt,
  })
}

async function openHistoryDetail(page: Page) {
  await openWorkspace(page)
  await expect(historyStrip(page)).toBeVisible({ timeout: 15000 })
  await historyStrip(page).getByRole('button', { name: /open history item/i }).first().click()
  await expect(page.getByTestId('history-detail-dialog')).toBeVisible({ timeout: 15000 })
}

async function restoreHistoryToWorkspace(page: Page) {
  await openHistoryDetail(page)
  await page
    .getByTestId('history-detail-dialog')
    .getByRole('button', { name: /restore to workspace/i })
    .click()
  await expect(page.getByTestId('history-detail-dialog')).toHaveCount(0)
  await expect(promptCard(page)).toContainText(restoredPrompt, { timeout: 15000 })
}

test.describe('plan-05 Iteration Memory and Save Style Memory entry', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockCdnImages(page)
  })

  test('TC-5.1 generation completion refreshes Recent iterations with the latest thumbnail', async ({
    page,
  }) => {
    await mockGenerationListSequence(page, [{ items: [] }, { items: [historyItem] }])
    await mockGenerationCreate(page, 'iteration-memory-generation-task')
    await mockGenerationPolling(page, 'iteration-memory-generation-task', {
      ...loadFixture('generation-completed.json'),
      id: 'iteration-memory-generation-task',
      resultFileUrl: historyItem.resultFileUrl,
    })

    await openWithCompletedAnalysis(page, 'iteration-memory-analysis-task')
    await renderDock(page).getByRole('button', { name: /^Generate$/i }).click()
    await expect(page.getByTestId('generation-dialog')).toContainText(/Generated Result/i, {
      timeout: 15000,
    })

    await expect(historyStrip(page).getByRole('button', { name: /open history item/i })).toHaveCount(
      1,
      { timeout: 15000 },
    )
  })

  test('TC-5.2 empty Iteration Memory explains compare, restore, and reuse value', async ({
    page,
  }) => {
    await mockGenerationList(page)
    await openWorkspace(page)

    const strip = historyStrip(page)
    await expect(strip).toBeVisible()
    await expect(strip).toContainText(/renders will appear here as visual evidence/i)
    await expect(strip).toContainText(/compare,?\s*restore,?\s*and reuse/i)
    await expect(strip).toContainText(/Iteration Memory/i)
    await expect(strip.getByRole('button', { name: /compare/i })).toBeDisabled()
  })

  test('TC-5.3 history detail shows prompt, params, restore, continue, and Save Style Memory actions', async ({
    page,
  }) => {
    await mockGenerationList(page, [historyItem])
    await mockRestoredHistoryDetail(page)

    await openHistoryDetail(page)

    const dialog = page.getByTestId('history-detail-dialog')
    await expect(dialog).toContainText(restoredPrompt)
    await expect(dialog).toContainText(restoredNegativePrompt)
    await expect(dialog).toContainText('16:9')
    await expect(dialog).toContainText(/HD/i)
    await expect(dialog.getByRole('button', { name: /restore to workspace/i })).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: /generate variation|continue editing/i }),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: /save as style memory/i })).toBeVisible()
  })

  test('TC-5.4 restore loads prompt, style intelligence, render params, and allows a variation render', async ({
    page,
  }) => {
    await mockGenerationList(page, [historyItem])
    await mockRestoredHistoryDetail(page)
    await mockGenerationCreate(page, 'restored-variation-task')
    await mockGenerationPolling(page, 'restored-variation-task', {
      id: 'restored-variation-task',
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    await restoreHistoryToWorkspace(page)

    await expect(promptCard(page)).toContainText(restoredPrompt)
    await expect(styleIntelligence(page).getByTestId('evidence-facet-lighting')).toBeVisible()
    await expect(renderDock(page).getByLabel(/Aspect Ratio/i)).toHaveValue('16:9')
    await expect(renderDock(page).getByLabel(/Quality/i)).toHaveValue('hd')
    await expect(renderDock(page).getByRole('button', { name: /^Generate$/i })).toBeEnabled()

    await renderDock(page).getByRole('button', { name: /^Generate$/i }).click()
    await expect(appShell(page).getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'generating',
      { timeout: 15000 },
    )
  })

  test('TC-5.5 saving restored history as Style Memory posts restored source context and variables', async ({
    page,
  }) => {
    let templateRequestBody: Record<string, unknown> | null = null

    await mockGenerationList(page, [historyItem])
    await mockRestoredHistoryDetail(page)
    await mockTemplateCreate(page, (body) => {
      templateRequestBody = body
    })

    await restoreHistoryToWorkspace(page)
    await renderDock(page).getByRole('button', { name: /save as style memory/i }).click()

    const saveDialog = page.getByRole('dialog', { name: /save as template|save as style memory/i })
    await expect(saveDialog).toBeVisible()
    await expect(saveDialog.getByLabel('Prompt Content')).toHaveValue(restoredPrompt)

    await saveDialog.getByLabel('Template Name').fill('Restored glass memory')
    await saveDialog.getByRole('button', { name: /save template|save style memory/i }).click()

    await expect.poll(() => templateRequestBody).not.toBeNull()
    const savedTemplateRequestBody = templateRequestBody as unknown as Record<string, unknown>
    expect(savedTemplateRequestBody).toMatchObject({
      content: restoredPrompt,
      sourceAnalysisTaskId: 'restored-analysis-task',
    })
    expect(savedTemplateRequestBody.sourceAssetId).toBe('restored-source-asset')
    expect(savedTemplateRequestBody.sourceImageUrl).toBe(restoredSourceImageUrl)
    expect(savedTemplateRequestBody.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.any(String) }),
      ]),
    )
  })

  test('TC-5.6 history API failure shows a recoverable state instead of the empty history lesson', async ({
    page,
  }) => {
    await mockApiError(page, '**/api/generation?**', 500, {
      error: 'History temporarily unavailable',
      code: 'HISTORY_UNAVAILABLE',
      retryable: true,
    })

    await openWorkspace(page)

    const strip = historyStrip(page)
    await expect(strip).toBeVisible()
    await expect(strip).toContainText(/history temporarily unavailable|retry|failed/i)
    await expect(strip).not.toContainText(/renders will appear here as visual evidence/i)
  })
})
