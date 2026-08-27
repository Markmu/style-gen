import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'path'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockAuthSession,
  mockGenerationList,
  mockGenerationPolling,
  mockUploadPresign,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const templateAnalysisResponse = {
  ...loadFixture('analysis-completed.json'),
  analysisTemplateContent:
    'Create {{subject}} inside {{scene}} with {{visual_style}} and {{lighting_color}}.',
  analysisTemplateVariables: [
    { name: 'subject', label: 'Subject', defaultValue: 'glass fox', sourceField: 'subject' },
    { name: 'scene', label: 'Scene', defaultValue: 'neon rain garden', sourceField: 'scene' },
    {
      name: 'visual_style',
      label: 'Visual style',
      defaultValue: 'editorial glass realism',
      sourceField: 'visual_style',
    },
    {
      name: 'lighting_color',
      label: 'Lighting',
      defaultValue: 'blue rim light and soft silver fill',
      sourceField: 'lighting_color',
    },
  ],
  analysisTemplateStatus: 'ready',
  analysisTemplateReason: null,
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

  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
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

async function uploadReference(page: Page) {
  const referenceColumn = appShell(page).getByRole('region', { name: 'Reference Canvas column' })
  const input = referenceColumn.locator('input[type="file"]')
  await waitForReactInput(input)
  await input.setInputFiles(TEST_IMAGE_PATH)
}

async function openWithCompletedAnalysis(
  page: Page,
  taskId: string,
  response: object = loadFixture('analysis-completed.json'),
) {
  await mockUploadPresign(page)
  await mockAnalysisCreate(page, taskId)
  await mockAnalysisPolling(page, taskId, response)

  await openWorkspace(page)
  await uploadReference(page)
  await expect(appShell(page).getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analysis_ready', {
    timeout: 15000,
  })
}

function appShell(page: Page) {
  return page.getByTestId('app-shell')
}

function renderDock(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('output-card')
}

function promptCard(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('prompt-card')
}

async function mockGenerationCreateWithCapture(
  page: Page,
  taskId: string,
  onBody?: (body: Record<string, unknown>) => void,
) {
  await page.route('**/api/generation', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    onBody?.(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: taskId, status: 'pending' }),
    })
  })
}

test.describe('plan-04 Render Dock readiness and generation recovery', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('TC-4.1 empty workspace exposes the compact Render Dock controls', async ({ page }) => {
    await openWorkspace(page)

    const dock = renderDock(page)
    await expect(dock).toBeVisible()
    await expect(dock).toHaveAttribute('data-readiness-can-generate', 'false')
    await expect(dock.getByTestId('render-readiness-list')).toHaveCount(0)
    await expect(dock.locator('[data-testid^="render-readiness-item-"]')).toHaveCount(0)
    await expect(dock.getByTestId('render-disabled-reason')).toHaveCount(0)
    await expect(dock.getByTestId('render-next-action')).toHaveCount(0)
    await expect(dock.getByLabel(/Aspect Ratio/i)).toBeVisible()
    await expect(dock.getByLabel(/Quality/i)).toBeVisible()
    await expect(dock.getByLabel(/Model/i)).toBeVisible()
    await expect(dock.getByRole('button', { name: /^Generate$/i })).toBeDisabled()
  })

  test('TC-4.2 unresolved variables block generation with a variables-specific reason', async ({ page }) => {
    let generationPostCount = 0
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (request.method() === 'POST' && url.pathname === '/api/generation') {
        generationPostCount += 1
      }
    })

    await openWithCompletedAnalysis(page, 'render-dock-unresolved-variables', templateAnalysisResponse)
    await page.getByLabel('Prompt mode').selectOption('variables')
    await page.getByLabel('Variable subject').fill('{{subject}}')

    const dock = renderDock(page)
    await expect(dock.locator('[data-testid^="render-readiness-item-"]')).toHaveCount(0)
    const generateButton = dock.getByRole('button', { name: /^Generate$/i })
    await expect(generateButton).toBeDisabled()
    await expect(generateButton).toHaveAttribute('title', /resolve|variable|变量/i)
    expect(generationPostCount).toBe(0)
  })

  test('TC-4.3 ready Render Dock posts the existing generation API contract', async ({ page }) => {
    const generationTaskId = 'render-dock-ready-generation'
    let requestBody: Record<string, unknown> | null = null
    await mockGenerationCreateWithCapture(page, generationTaskId, (body) => {
      requestBody = body
    })
    await mockGenerationPolling(page, generationTaskId, {
      id: generationTaskId,
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    await openWithCompletedAnalysis(page, 'render-dock-ready-analysis')

    const dock = renderDock(page)
    await expect(dock.getByLabel(/Aspect Ratio/i)).toBeVisible()
    await expect(dock.getByLabel(/Quality/i)).toBeVisible()
    await expect(dock.getByLabel(/Model/i)).toHaveValue('flux-2-dev')
    await expect(dock.locator('[data-testid^="render-readiness-item-"]')).toHaveCount(0)
    await expect(dock.getByRole('button', { name: /^Generate$/i })).toBeEnabled()
    await dock.getByLabel(/Model/i).selectOption('nano-banana-2-lite')
    await dock.getByRole('button', { name: /^Generate$/i }).click()

    await expect.poll(() => requestBody?.analysisTaskId ?? null).toBe('render-dock-ready-analysis')
    const capturedBody = requestBody as unknown as Record<string, unknown>
    expect(capturedBody.promptText).toContain('sunset')
    expect(capturedBody.negativePromptText).toBe('blurry, low quality, distorted, watermark, text')
    expect(capturedBody.params).toMatchObject({
      aspectRatio: '1:1',
      quality: 'standard',
      model: 'nano-banana-2-lite',
    })
  })

  test('TC-4.4 service unavailable disables Generate but keeps editing and saving available', async ({ page }) => {
    await page.route('**/api/generation', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Generation service temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
          retryable: true,
        }),
      })
    })

    await openWithCompletedAnalysis(page, 'render-dock-service-unavailable-analysis')
    await renderDock(page).getByRole('button', { name: /^Generate$/i }).click()

    const dock = renderDock(page)
    await expect(dock.getByRole('button', { name: /^Generate$/i })).toBeDisabled({
      timeout: 15000,
    })
    await expect(dock.getByTestId('render-disabled-reason')).toHaveCount(0)
    await expect(dock.locator('[data-testid^="render-readiness-item-"]')).toHaveCount(0)
    await expect(promptCard(page).getByLabel('Full Generation Prompt')).toBeEditable()
    await expect(dock.getByRole('button', { name: /save as style memory/i })).toHaveCount(0)
    await expect(
      promptCard(page).getByRole('button', { name: /save as style memory/i }),
    ).toBeEnabled()

    const generationDialog = page.getByTestId('generation-dialog')
    await expect(generationDialog).toBeVisible()
    await generationDialog.getByRole('button', { name: /close dialog/i }).click()
    await expect(generationDialog).toBeHidden()

    await promptCard(page).getByRole('button', { name: /save as style memory/i }).click()
    // plan-06：保存入口打开三步向导；完整提示预填在步骤 3 高级信息内
    const saveDialog = page.getByTestId('save-style-memory-dialog')
    await expect(saveDialog).toBeVisible()
    await saveDialog.getByRole('button', { name: /下一步/ }).click()
    await saveDialog.getByRole('button', { name: /高级信息|完整提示/ }).click()
    await expect(saveDialog.getByLabel(/完整提示（可编辑/)).toHaveValue(/sunset/i)
  })

  test('TC-4.5 generating disables duplicate submits while keeping parameters visible', async ({ page }) => {
    const generationTaskId = 'render-dock-processing-generation'
    let generationPostCount = 0
    await mockGenerationCreateWithCapture(page, generationTaskId, () => {
      generationPostCount += 1
    })
    await mockGenerationPolling(page, generationTaskId, {
      id: generationTaskId,
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    await openWithCompletedAnalysis(page, 'render-dock-processing-analysis')

    await renderDock(page).getByRole('button', { name: /^Generate$/i }).click()
    await expect(appShell(page).getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'generating', {
      timeout: 15000,
    })

    const dock = renderDock(page)
    await expect(dock.getByRole('button', { name: /rendering|generate/i })).toBeDisabled()
    await expect(dock.getByLabel(/Aspect Ratio/i)).toBeVisible()
    await expect(dock.getByLabel(/Aspect Ratio/i)).toBeDisabled()
    await expect(dock.getByLabel(/Quality/i)).toBeVisible()
    await expect(dock.getByLabel(/Quality/i)).toBeDisabled()
    await expect(dock.getByLabel(/Model/i)).toBeVisible()
    await expect(dock.getByLabel(/Model/i)).toBeDisabled()
    expect(generationPostCount).toBe(1)
  })

  test('TC-4.6 generation failure preserves context while Render Dock stays compact', async ({ page }) => {
    const generationTaskId = 'render-dock-failed-generation'
    await mockGenerationCreateWithCapture(page, generationTaskId)
    await mockGenerationPolling(page, generationTaskId, {
      id: generationTaskId,
      analysisTaskId: 'render-dock-failed-analysis',
      status: 'failed',
      promptSnapshot: 'A preserved prompt snapshot',
      negativePromptSnapshot: 'low quality',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'fal-ai/flux-2',
      resultAssetId: null,
      resultFileUrl: null,
      errorMessage: 'Generation provider failed after queueing',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:05.000Z',
    })

    await openWithCompletedAnalysis(page, 'render-dock-failed-analysis')
    const originalPrompt = await promptCard(page).getByLabel('Full Generation Prompt').inputValue()

    await renderDock(page).getByRole('button', { name: /^Generate$/i }).click()

    await expect(page.getByTestId('generation-dialog')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('generation-dialog')).toContainText(/Generation Failed/i)
    await expect(page.getByTestId('generation-dialog')).toContainText(
      /reference|prompt|params|preserved|kept|保留/i,
    )

    const dock = renderDock(page)
    await expect(dock.getByTestId('render-recovery-actions')).toHaveCount(0)
    await expect(dock.locator('[data-testid^="render-readiness-item-"]')).toHaveCount(0)
    await expect(promptCard(page).getByLabel('Full Generation Prompt')).toHaveValue(originalPrompt)
    await expect(dock.getByLabel(/Aspect Ratio/i)).toHaveValue('1:1')
  })
})
