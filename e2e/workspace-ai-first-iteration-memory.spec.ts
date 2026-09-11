import { generateCurrentDraft, revealInspectorPanel } from './helpers/workspace-actions';
import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockApiError,
  mockAuthSession,
  mockGenerationCreate,
  mockGenerationDetail,
  mockDirectionFeedStateful,
  mockGenerationList,
  mockGenerationPolling,
  mockUploadPresign,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'

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

function resultRail(page: Page) {
  return appShell(page).getByTestId('direction-result-rail')
}

const railItem = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  status: 'completed' as const,
  resultAssetId: `asset-${id}`,
  resultFileUrl: historyItem.resultFileUrl,
  promptSummary: 'Latest render',
  params: { aspectRatio: '1:1', quality: 'standard' },
  createdAt: historyItem.createdAt,
  errorMessage: null,
  ...overrides,
})


function promptCard(page: Page) {
  return appShell(page)
    
    .getByTestId('prompt-card')
}

function renderDock(page: Page) {
  return appShell(page).getByTestId('generation-bar')
}

function styleIntelligence(page: Page) {
  return appShell(page)
    
    .getByTestId('recipe-card')
}

function referenceCard(page: Page) {
  return appShell(page).getByTestId('reference-card')
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
  const input = appShell(page).getByTestId('reference-card')
    
    .locator('input[type="file"]')
  await waitForReactInput(input)
  await input.setInputFiles(TEST_IMAGE_PATH)
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
  await openWithCompletedAnalysis(page, 'iteration-memory-analysis-task')
  await mockDirectionFeedStateful(page, {
    completed: [railItem(historyItem.id)],
    active: null,
    latestFailure: null,
  })
  await page.reload()
  await expect(resultRail(page)).toBeVisible({ timeout: 15000 })
  await resultRail(page)
    .getByRole('button', { name: `Select result Latest render` })
    .click()
  await page.getByRole('button', { name: 'Continue from this result', exact: true }).click()
  await expect(page.getByTestId('history-detail-dialog')).toBeVisible({ timeout: 15000 })
}

async function restoreHistoryToWorkspace(page: Page) {
  await openHistoryDetail(page)
  await page
    .getByTestId('history-detail-dialog')
    .getByRole('button', { name: /continue from this result/i })
    .click()
  await expect(page.getByRole('dialog',{name:'Preview direction change'})).toBeVisible()
  await page.getByRole('dialog',{name:'Preview direction change'}).getByRole('button',{name:'Confirm',exact:true}).click()
  await expect(page.getByTestId('history-detail-dialog')).toHaveCount(0)
  await revealInspectorPanel(page, 'prompt')
  await expect(promptCard(page)).toContainText(restoredPrompt, { timeout: 15000 })
}

test.describe('plan-05 Iteration Memory and Save Style Memory entry', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockCdnImages(page)
  })

  test('TC-5.1 generation completion refreshes Current results with the latest thumbnail', async ({
    page,
  }) => {
    await mockGenerationCreate(page, 'iteration-memory-generation-task')
    await mockGenerationPolling(page, 'iteration-memory-generation-task', {
      ...loadFixture('generation-completed.json'),
      id: 'iteration-memory-generation-task',
      resultFileUrl: historyItem.resultFileUrl,
    })
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: {
        ...railItem('iteration-memory-generation-task'),
        status: 'processing',
        resultAssetId: null,
        resultFileUrl: null,
      },
      latestFailure: null,
    })

    await openWithCompletedAnalysis(page, 'iteration-memory-analysis-task')
    await generateCurrentDraft(page)
    // plan-07（实现规格 §4）：成功不打开阻断式 GenerationDialog——完成事实经
    // 方向 feed 内联刷新，本用例以 Current results 缩略图为完成锚点
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    feed.set({
      completed: [railItem('iteration-memory-generation-task')],
      active: null,
      latestFailure: null,
    })
    await expect(resultRail(page).getByTestId('direction-completed-item')).toHaveCount(
      1,
      { timeout: 15000 },
    )
  })

  test('TC-5.2 empty Current results offers the compact progress copy', async ({
    page,
  }) => {
    await mockDirectionFeedStateful(page, { completed: [], active: null, latestFailure: null })

    await openWithCompletedAnalysis(page, 'iteration-memory-analysis-task')

    const rail = resultRail(page)
    await expect(rail).toBeVisible()
    await expect(rail).toContainText(/renders and their progress will appear here/i)
    await expect(rail.getByRole('button', { name: /compare/i })).toHaveCount(0)
  })

  test('TC-5.3 history detail shows prompt, params, restore, and continue actions', async ({
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
    await expect(dialog.getByRole('button', { name: /continue from this result/i })).toBeVisible()
    await expect(dialog).toContainText(/Legacy result|Direction:/)
    await expect(dialog.getByRole('button', { name: /save as style memory/i })).toHaveCount(0)
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

    await expect(referenceCard(page).getByRole('img', { name: 'Reference' })).toHaveAttribute(
      'src',
      restoredSourceImageUrl,
    )
    await revealInspectorPanel(page, 'prompt')
    await expect(promptCard(page)).toContainText(restoredPrompt)
    await revealInspectorPanel(page, 'evidence')
    await expect(styleIntelligence(page).getByTestId('evidence-facet-lighting')).toBeVisible()
    await expect(renderDock(page).getByLabel(/Aspect Ratio/i)).toHaveValue('16:9')
    await expect(renderDock(page).getByLabel(/Quality/i)).toHaveValue('hd')
    await expect(renderDock(page).getByRole('button', { name: /^Generate 1 image$/i })).toBeDisabled()
    await renderDock(page).getByLabel('Model',{exact:true}).selectOption('flux-2-dev')
    await renderDock(page).getByLabel(/Quality/i).selectOption('standard')

    await generateCurrentDraft(page)
    await expect(appShell(page).getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'generating',
      { timeout: 15000 },
    )
  })

  test('TC-5.5 restored history does not expose Save as Style Memory actions', async ({
    page,
  }) => {
    await mockGenerationList(page, [historyItem])
    await mockRestoredHistoryDetail(page)

    await openHistoryDetail(page)
    await expect(
      page.getByTestId('history-detail-dialog').getByRole('button', { name: /save as style memory/i }),
    ).toHaveCount(0)
    await page
      .getByTestId('history-detail-dialog')
      .getByRole('button', { name: /continue from this result/i })
      .click()
    const preview = page.getByRole('dialog', { name: 'Preview direction change' })
    await expect(preview).toBeVisible()
    await preview.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByTestId('history-detail-dialog')).toHaveCount(0)
    await expect(renderDock(page).getByRole('button', { name: /save as style memory/i })).toHaveCount(0)
    await revealInspectorPanel(page, 'prompt')
    await expect(promptCard(page).getByRole('button', { name: /save as style memory/i })).toHaveCount(0)
  })

  test('TC-5.6 direction feed failure shows a recoverable state instead of the empty progress copy', async ({
    page,
  }) => {
    await mockApiError(page, '**/api/generation?**', 500, {
      error: 'History temporarily unavailable',
      code: 'HISTORY_UNAVAILABLE',
      retryable: true,
    })

    await openWithCompletedAnalysis(page, 'iteration-memory-analysis-task')

    const rail = resultRail(page)
    await expect(rail).toBeVisible()
    await expect(rail).toContainText(/could not be refreshed|retry|failed/i)
    await expect(rail.getByTestId('direction-feed-error')).toBeVisible()
  })
})
