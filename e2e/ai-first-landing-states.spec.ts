import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'path'
import {
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockApiError,
  mockAuthSession,
  mockGenerationList,
  mockTemplateCollection,
  mockUploadPresign,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')
const STORAGE_KEY = 'style-gen-workspace-state'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

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

async function mockCdnImages(page: Page) {
  await page.route('https://cdn.example.com/**', async (route) => {
    if (
      route.request().resourceType() === 'image' ||
      /\.(png|jpg|jpeg|webp)$/.test(route.request().url())
    ) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      return
    }
    await route.continue()
  })
}

function appShell(page: Page) {
  return page.getByTestId('app-shell')
}

function primaryNav(page: Page) {
  return page.getByTestId('app-shell-primary-nav')
}

function statePresenter(page: Page, status: string) {
  return page.locator(`section[data-status="${status}"]`)
}

function workspaceReferenceCard(page: Page) {
  return page
    .getByRole('main')
    .getByTestId('workspace-reference-column')
    .getByTestId('reference-card')
}

test.describe('plan-07 Landing / Auth / global states closure', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test('TC-7.1 Landing first viewport explains Reference -> Evidence -> Render', async ({
    page,
  }) => {
    await mockAuthSession(page)

    await openRoute(page, '/')

    await expect(appShell(page)).toBeVisible()
    await expect(appShell(page)).toHaveAttribute('data-variant', 'landing')
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(primaryNav(page)).toBeVisible()

    const landingMain = page.getByRole('main')
    await expect(landingMain).toContainText(/Reference\s*(?:->|→)\s*Evidence\s*(?:->|→)\s*Render/i)
    await expect(landingMain).toContainText(/AI/i)
    await expect(landingMain).toContainText(/prompt/i)
    await expect(landingMain).toContainText(/render/i)

    for (const signal of ['color', 'composition', 'lighting', 'texture', 'mood']) {
      await expect(landingMain).toContainText(new RegExp(signal, 'i'))
    }

    await expect(
      landingMain
        .getByRole('button', { name: /upload.*reference|start from reference/i })
        .or(landingMain.getByText(/upload a reference/i))
        .first(),
    ).toBeVisible()
    await expect(landingMain.getByRole('link', { name: /style memory/i })).toBeVisible()
    await expect(landingMain.getByText(/Template Library/i)).toHaveCount(0)
  })

  test('TC-7.2 Landing upload handoff is consumed by Workspace before analysis starts', async ({
    page,
  }) => {
    const analysisTaskId = 'plan-07-landing-handoff-analysis'
    const apiRequests: Array<{ kind: string; pageUrl: string }> = []

    page.on('request', (request) => {
      const url = new URL(request.url())
      if (
        request.method() === 'POST' &&
        (url.pathname === '/api/upload/presign' || url.pathname === '/api/analysis')
      ) {
        apiRequests.push({
          kind: url.pathname,
          pageUrl: page.url(),
        })
      }
    })

    await mockAuthSession(page)
    await mockGenerationList(page)
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

    await openRoute(page, '/')
    await expect(page.getByRole('button', { name: /user menu/i })).toBeVisible({
      timeout: 5000,
    })

    const input = page.getByRole('main').locator('input[type="file"]').first()
    await waitForReactInput(input)
    await input.setInputFiles(TEST_IMAGE_PATH)

    await expect(page).toHaveURL(/\/workspace(?:\?|$)/, { timeout: 15000 })
    await expect(appShell(page)).toHaveAttribute('data-variant', 'workspace')
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analyzing', {
      timeout: 15000,
    })
    const referenceCard = workspaceReferenceCard(page)
    await expect(referenceCard).toHaveCount(1)
    await expect(referenceCard.first().getByAltText('Reference')).toBeVisible()
    await expect(referenceCard.first().getByLabel('Reference analysis loading')).toHaveCount(0)

    expect(apiRequests.map((request) => request.kind)).toEqual([
      '/api/upload/presign',
      '/api/analysis',
    ])
    expect(apiRequests.every((request) => request.pageUrl.includes('/workspace'))).toBe(true)
  })

  test('TC-7.3 auth restricted state keeps workspace context and offers login/back actions', async ({
    page,
  }) => {
    const workspaceSnapshot = JSON.stringify({
      version: 4,
      assetId: 'plan-07-persisted-asset',
      referenceImageUrl: 'https://cdn.example.com/references/plan-07/original.png',
      analysisTaskId: 'plan-07-persisted-analysis',
      recipe: null,
      promptText: 'Persisted prompt survives auth restriction',
      negativePromptText: 'low quality',
      analysisTemplateContent: null,
      analysisTemplateVariables: [],
      analysisTemplateStatus: null,
      analysisTemplateReason: null,
      generationTaskId: null,
      v2PromptState: null,
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

    await expect(appShell(page)).toHaveAttribute('data-variant', 'memory')
    await expect(
      page.getByTestId('workspace-sidebar-auth-entry').getByRole('button', { name: /log in/i }).first(),
    ).toBeVisible()

    const authState = statePresenter(page, 'authRequired')
    await expect(authState).toBeVisible()
    await expect(authState).toContainText(/log in|sign in|login/i)
    await expect(authState).toContainText(/context|preserved|snapshot|unchanged|stays/i)
    await expect(
      authState.getByRole('button', { name: /log in|sign in|login/i }),
    ).toBeVisible()
    await expect(
      authState.getByRole('button', { name: /back to workspace/i }),
    ).toBeVisible()

    const stored = await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY)
    expect(stored).toBe(workspaceSnapshot)
  })

  test('TC-7.4 Workspace and Style Memory empty/no-results states stay action-oriented', async ({
    page,
  }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockTemplateCollection(page, [])

    await openRoute(page, '/workspace')

    const referenceCard = workspaceReferenceCard(page)
    await expect(referenceCard).toHaveCount(1)
    await expect(referenceCard.first()).toContainText(/AI will read the reference as evidence/i)
    for (const signal of ['color', 'composition', 'lighting', 'texture', 'mood']) {
      await expect(referenceCard.first()).toContainText(new RegExp(signal, 'i'))
    }
    await expect(page.getByRole('link', { name: /style memory/i })).toBeVisible()

    await openRoute(page, '/workspace/templates')

    const emptyState = statePresenter(page, 'empty')
    await expect(emptyState).toBeVisible()
    await expect(emptyState).toContainText(/style memory/i)
    await expect(emptyState).toContainText(/工作区|iteration|save|create/i)
    // plan-04：空态双入口为链接（打开工作区 / 查看 Iterations）
    await expect(emptyState.getByRole('link', { name: /Open workspace/ })).toHaveAttribute(
      'href',
      '/workspace',
    )
    await expect(emptyState.getByRole('link', { name: /View iterations/ })).toHaveAttribute(
      'href',
      '/workspace/iterations',
    )

    const searchBox = page.getByRole('textbox')
    await searchBox.fill('nonexistent brutalist neon memory')

    const noResultsState = statePresenter(page, 'noResults')
    await expect(noResultsState).toBeVisible({ timeout: 10000 })
    await expect(noResultsState).toContainText(/style memor|No matching/i)
    await expect(
      noResultsState.getByRole('button', { name: /clear search/i }),
    ).toBeVisible()
    await expect(
      noResultsState.getByRole('button', { name: /back to workspace/i }),
    ).toBeVisible()
  })

  test('TC-7.5 legacy Landing and Template Library primary copy is removed from the main path', async ({
    page,
  }) => {
    await mockAuthSession(page)

    await openRoute(page, '/')

    const landingMain = page.getByRole('main')
    await expect(landingMain.getByText(/Reference Image Style Recreation/i)).toHaveCount(0)
    await expect(landingMain.getByText(/^Template Library$/i)).toHaveCount(0)
    await expect(landingMain.getByText(/Visual Recipe/i)).toHaveCount(0)
    await expect(landingMain.getByText(/Recreate a Style in Three Steps/i)).toHaveCount(0)
    await expect(landingMain.getByText(/Generate a New Image in the Same Style/i)).toHaveCount(0)
    await expect(landingMain.getByRole('link', { name: /style memory/i })).toBeVisible()
  })

  test('TC-7.6 Style Memory service failure is recoverable instead of an empty library', async ({
    page,
  }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockApiError(page, '**/api/templates?**', 500, {
      error: 'Style Memory service temporarily unavailable',
      code: 'STYLE_MEMORY_UNAVAILABLE',
      retryable: true,
    })

    await openRoute(page, '/workspace/templates')

    const failedState = statePresenter(page, 'failedRecoverable')
    await expect(failedState).toBeVisible()
    await expect(failedState).toContainText(/style memory|service|unavailable/i)
    await expect(failedState).toContainText(/preserved|retry/i)
    await expect(failedState.getByRole('button', { name: /重试|retry/i })).toBeVisible()
    await expect(
      failedState.getByRole('button', { name: /back to workspace/i }),
    ).toBeVisible()
    await expect(statePresenter(page, 'empty')).toHaveCount(0)
    await expect(statePresenter(page, 'noResults')).toHaveCount(0)
  })
})
