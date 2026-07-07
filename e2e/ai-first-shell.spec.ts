import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'path'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockApiError,
  mockAuthSession,
  mockGenerationCreate,
  mockGenerationList,
  mockGenerationPollingSequence,
  mockTemplateList,
  mockUploadPresign,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')
const STORAGE_KEY = 'style-gen-workspace-state'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const styleMemoryItems = [
  {
    id: 'mock-style-memory-id',
    name: 'Editorial Soft Light',
    variableCount: 2,
    sourceAssetId: 'mock-asset-id',
    sourceImageUrl: 'https://cdn.example.com/references/mock-asset-id/original.png',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
]

async function openRoute(page: Page, route: string) {
  try {
    await page.goto(route, { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }

  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
}

async function mockCommonApis(page: Page) {
  await mockAuthSession(page)
  await mockGenerationList(page)
  await mockTemplateList(page, styleMemoryItems)
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
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByText(/click or drag to upload a reference image/i).first().click()
  const chooser = await chooserPromise
  await chooser.setFiles(TEST_IMAGE_PATH)
}

function appShell(page: Page) {
  return page.getByTestId('app-shell')
}

function primaryNav(page: Page) {
  return page.getByTestId('app-shell-primary-nav')
}

function navItem(page: Page, name: RegExp) {
  return primaryNav(page)
    .getByRole('link', { name })
    .or(primaryNav(page).getByRole('button', { name }))
    .first()
}

function aiStatusHeader(page: Page) {
  return page.getByTestId('ai-status-header')
}

async function expectSharedShell(page: Page, variant: string) {
  await expect(appShell(page)).toBeVisible({ timeout: 5000 })
  await expect(appShell(page)).toHaveAttribute('data-variant', variant)
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(primaryNav(page)).toBeVisible()
  await expect(page.locator('main')).toBeVisible()
  await expect(navItem(page, /^Workspace$/i)).toBeVisible()
  await expect(navItem(page, /^Style Memory$/i)).toBeVisible()
}

test.describe('plan-02 AppShell and AI status header', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  for (const route of [
    { path: '/', variant: 'landing', label: 'Landing' },
    { path: '/workspace', variant: 'workspace', label: 'Workspace' },
    { path: '/workspace/templates', variant: 'memory', label: 'Style Memory' },
  ]) {
    test(`TC-2.1 ${route.label} renders the shared AI-first AppShell`, async ({ page }) => {
      await mockCommonApis(page)

      await openRoute(page, route.path)

      await expectSharedShell(page, route.variant)
    })
  }

  test('TC-2.2 keeps /workspace/templates on the Style Memory active nav item', async ({ page }) => {
    await mockCommonApis(page)

    await openRoute(page, '/workspace/templates')

    const styleMemoryNav = navItem(page, /^Style Memory$/i)
    await expect(styleMemoryNav).toBeVisible()
    await expect(styleMemoryNav).toHaveAttribute('aria-current', 'page')
    await expect(primaryNav(page).getByText(/Template Library/i)).toHaveCount(0)
    await expect(page).toHaveURL(/\/workspace\/templates$/)
  })

  test('TC-2.3 shows an idle Workspace AI status header with next action and service state', async ({ page }) => {
    await mockCommonApis(page)

    await openRoute(page, '/workspace')

    await expect(aiStatusHeader(page)).toBeVisible({ timeout: 5000 })
    await expect(aiStatusHeader(page)).toHaveAttribute('data-phase', 'idle')
    await expect(aiStatusHeader(page)).toContainText(/upload|reference/i)
    await expect(aiStatusHeader(page)).toContainText(/service|ready|available/i)
    await expect(aiStatusHeader(page)).toContainText(/next/i)
  })

  test('TC-2.4 updates the AI status header while analysis is processing', async ({ page }) => {
    const analysisTaskId = 'ai-shell-processing-analysis'
    await mockCommonApis(page)
    await mockCdnImages(page)
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, {
      id: analysisTaskId,
      status: 'processing',
      recipe: null,
      promptText: null,
      negativePromptText: null,
      errorMessage: null,
      errorStage: null,
    })

    await openRoute(page, '/workspace')
    await uploadReference(page)

    await expect(aiStatusHeader(page)).toHaveAttribute('data-phase', 'analyzing', {
      timeout: 15000,
    })
    await expect(aiStatusHeader(page)).toContainText(/reading|extracting|style signals/i)
    await expect(aiStatusHeader(page)).toContainText(/color|composition|lighting|texture|mood/i)
  })

  test('TC-2.5 updates the AI status header when analysis is ready', async ({ page }) => {
    const analysisTaskId = 'ai-shell-ready-analysis'
    await mockCommonApis(page)
    await mockCdnImages(page)
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, loadFixture('analysis-completed.json'))

    await openRoute(page, '/workspace')
    await uploadReference(page)

    await expect(aiStatusHeader(page)).toHaveAttribute('data-phase', 'analysis_ready', {
      timeout: 15000,
    })
    await expect(aiStatusHeader(page)).toContainText(/ready|evidence|style signals|generate/i)
    await expect(aiStatusHeader(page)).toContainText(/next/i)
  })

  test('TC-2.6 shows generating and recoverable failure status without clearing context', async ({ page }) => {
    const analysisTaskId = 'ai-shell-generation-analysis'
    const generationTaskId = 'ai-shell-generation-task'
    await mockCommonApis(page)
    await mockCdnImages(page)
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, loadFixture('analysis-completed.json'))
    await mockGenerationCreate(page, generationTaskId)
    await mockGenerationPollingSequence(page, generationTaskId, [
      {
        id: generationTaskId,
        status: 'processing',
        resultFileUrl: null,
        errorMessage: null,
      },
      {
        id: generationTaskId,
        status: 'failed',
        resultFileUrl: null,
        errorMessage: 'Generation provider unavailable',
        errorStage: 'generation',
        code: 'SERVICE_UNAVAILABLE',
        retryable: true,
      },
    ])

    await openRoute(page, '/workspace')
    await uploadReference(page)
    await expect(aiStatusHeader(page)).toHaveAttribute('data-phase', 'analysis_ready', {
      timeout: 15000,
    })

    await page.getByTestId('output-card').getByRole('button', { name: /^Generate$/i }).click()

    await expect(aiStatusHeader(page)).toHaveAttribute('data-phase', 'generating', {
      timeout: 15000,
    })
    await expect(aiStatusHeader(page)).toContainText(/rendering|generating|processing|queued/i)

    await expect(aiStatusHeader(page)).toContainText(
      /recoverable|failed|unavailable|retry|back to edit/i,
      { timeout: 15000 },
    )

    await expect
      .poll(
        async () =>
          (await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY)) ?? '',
        { timeout: 5000 },
      )
      .toContain(analysisTaskId)
  })

  test('TC-2.7 keeps an existing workspace snapshot when Style Memory is auth restricted', async ({ page }) => {
    const workspaceSnapshot = JSON.stringify({
      version: 3,
      assetId: 'persisted-asset-id',
      referenceImageUrl: 'https://cdn.example.com/references/persisted/original.png',
      analysisTaskId: 'persisted-analysis-id',
      recipe: null,
      promptText: 'Persisted cinematic prompt',
      negativePromptText: 'low quality',
      analysisTemplateContent: null,
      analysisTemplateVariables: [],
      analysisTemplateStatus: null,
      analysisTemplateReason: null,
      generationTaskId: null,
    })

    await page.addInitScript(
      ({ key, value }) => window.sessionStorage.setItem(key, value),
      { key: STORAGE_KEY, value: workspaceSnapshot },
    )
    await mockGenerationList(page)
    await mockApiError(page, '**/api/templates?**', 401, {
      error: 'Authentication required',
    })

    await openRoute(page, '/workspace/templates')

    await expect(appShell(page)).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('app-shell-auth-entry')).toBeVisible()
    await expect(page.getByTestId('app-shell-auth-entry')).toContainText(/log in|sign in/i)

    const stored = await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY)
    expect(stored).toBe(workspaceSnapshot)
  })
})
