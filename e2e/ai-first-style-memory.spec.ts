import { expect, test, type Page } from '@playwright/test'
import {
  mockApiError,
  mockAuthSession,
  mockGenerationList,
  mockTemplateCollection,
  type MockTemplateMemoryRecord,
} from './helpers/mock-api'

const STORAGE_KEY = 'style-gen-workspace-state'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const styleMemories: MockTemplateMemoryRecord[] = [
  {
    id: 'style-memory-editorial-soft-light',
    name: 'Editorial Soft Light Memory',
    content:
      'Create {{subject}} inside {{scene}} with diffused daylight, translucent surfaces, and precise editorial spacing.',
    variables: [
      {
        name: 'subject',
        label: 'Subject',
        defaultValue: 'glass sculpture',
        sourceField: 'subject',
      },
      {
        name: 'scene',
        label: 'Scene',
        defaultValue: 'white studio',
        sourceField: 'scene',
      },
    ],
    sourceAssetId: 'style-memory-source-asset',
    sourceImageUrl: 'https://cdn.example.com/references/style-memory-source/original.png',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'style-memory-text-only',
    name: 'Prompt Structure Only',
    content: 'Reuse this prompt structure for product macro scenes.',
    variables: [],
    sourceAssetId: null,
    sourceImageUrl: null,
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
  },
]

function appShell(page: Page) {
  return page.getByTestId('app-shell')
}

function statePresenter(page: Page, status: string) {
  return page.locator(`section[data-status="${status}"]`)
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

async function openStyleMemory(page: Page) {
  try {
    await page.goto('/workspace/templates', { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }

  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
}

async function openMemoryActions(page: Page, name: string | RegExp) {
  await page.getByRole('heading', { name }).hover()
  await page.getByRole('button', { name: /more actions/i }).first().click()
}

test.describe('plan-06 Style Memory template library migration', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('TC-6.1 populated list uses Style Memory identity and evidence-rich cards', async ({
    page,
  }) => {
    await mockTemplateCollection(page, styleMemories)

    await openStyleMemory(page)

    await expect(appShell(page)).toHaveAttribute('data-variant', 'memory')
    await expect(page.getByRole('heading', { name: /^Style Memory$/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Template Library$/i })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: styleMemories[0].name })).toBeVisible()
  })

  test('TC-6.1 card source image, fallback preview, tags, and reuse intent are visible', async ({
    page,
  }) => {
    await mockTemplateCollection(page, styleMemories)

    await openStyleMemory(page)

    await expect(page.getByRole('heading', { name: styleMemories[0].name })).toBeVisible()
    await expect(
      page.getByRole('img', { name: /reference image for editorial soft light memory/i }),
    ).toBeVisible()
    await expect(page.getByText(/2 variables/i)).toBeVisible()
    await expect.soft(page.getByText(/No source preview/i).first()).toBeVisible()
    await expect.soft(page.getByText(/Style tags/i).first()).toBeVisible()
    await expect.soft(page.getByText(/Reuse intent/i).first()).toBeVisible()

    await page.getByRole('heading', { name: styleMemories[0].name }).hover()
    await expect
      .soft(page.getByRole('button', { name: /use (memory|style)/i }).first())
      .toBeVisible()
  })

  test('TC-6.2 Use memory injects prompt and variables through the existing template detail API', async ({
    page,
  }) => {
    await mockTemplateCollection(page, [styleMemories[0]])

    await openStyleMemory(page)
    await page.getByRole('heading', { name: styleMemories[0].name }).hover()
    const useMemoryButton = page.getByRole('button', { name: /use (memory|style)/i })
    await expect(useMemoryButton).toBeVisible({ timeout: 5000 })
    await useMemoryButton.click()

    await expect(page).toHaveURL(/\/workspace/)
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible({ timeout: 15000 })
    await expect(page.getByLabel('Variable subject')).toHaveValue('glass sculpture')
    await expect(page.getByLabel('Variable scene')).toHaveValue('white studio')
    await page.getByRole('button', { name: 'Text Mode' }).click()
    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue(
      /glass sculpture.*white studio/i,
    )
  })

  test('TC-6.3 Duplicate and Delete keep using the existing template API contract', async ({
    page,
  }) => {
    const api = await mockTemplateCollection(page, [styleMemories[0]])
    const styleMemoryEndpointRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/style-memory')) {
        styleMemoryEndpointRequests.push(request.url())
      }
    })

    await openStyleMemory(page)

    await openMemoryActions(page, styleMemories[0].name)
    await page.getByRole('button', { name: /^Duplicate$/i }).click()
    await expect(page.getByRole('heading', { name: `${styleMemories[0].name} Copy` })).toBeVisible({
      timeout: 5000,
    })
    expect(api.duplicateRequests).toEqual([styleMemories[0].id])

    await openMemoryActions(page, `${styleMemories[0].name} Copy`)
    await page.getByRole('button', { name: /^Delete$/i }).click()
    await expect(page.getByRole('alertdialog', { name: /confirm delete/i })).toBeVisible()
    await page
      .getByRole('alertdialog', { name: /confirm delete/i })
      .getByRole('button', { name: /^Delete$/i })
      .click()

    await expect(page.getByRole('heading', { name: `${styleMemories[0].name} Copy` })).toHaveCount(
      0,
      { timeout: 5000 },
    )
    expect(api.deleteRequests).toEqual([`${styleMemories[0].id}-copy`])
    expect(styleMemoryEndpointRequests).toEqual([])
  })

  test('TC-6.4 empty library explains how to create the first Style Memory', async ({ page }) => {
    await mockTemplateCollection(page, [])

    await openStyleMemory(page)

    const emptyState = statePresenter(page, 'empty')
    await expect(emptyState).toBeVisible()
    await expect(emptyState).toContainText(/style memory/i)
    await expect(emptyState).toContainText(/workspace|reference|create|save/i)
    await expect(
      emptyState.getByRole('button', { name: /create from reference|add reference|back to workspace/i }),
    ).toBeVisible()
    await expect(page.getByText(/No templates yet/i)).toHaveCount(0)
  })

  test('TC-6.5 search no results can be cleared without losing the Style Memory context', async ({
    page,
  }) => {
    await mockTemplateCollection(page, [styleMemories[0]])

    await openStyleMemory(page)
    const searchBox = page.getByRole('textbox')
    await searchBox.click()
    await page.keyboard.type('brutalist neon collage')
    await expect(searchBox).toHaveValue('brutalist neon collage')

    const noResultsState = statePresenter(page, 'noResults')
    await expect(noResultsState).toBeVisible({ timeout: 10000 })
    await expect(noResultsState).toContainText(/style memor/i)
    await expect(noResultsState.getByRole('button', { name: /clear search/i })).toBeVisible()
    await expect(noResultsState.getByRole('button', { name: /back to workspace/i })).toBeVisible()

    await noResultsState.getByRole('button', { name: /clear search/i }).click()
    await expect(page.getByRole('textbox')).toHaveValue('')
  })

  test('TC-6.6 API failure shows failedRecoverable instead of an empty memory lesson', async ({
    page,
  }) => {
    await mockApiError(page, '**/api/templates?**', 500, {
      error: 'Style Memory service temporarily unavailable',
      code: 'TEMPLATE_UNAVAILABLE',
      retryable: true,
    })

    await openStyleMemory(page)

    const failedState = statePresenter(page, 'failedRecoverable')
    await expect(failedState).toBeVisible()
    await expect(failedState).toContainText(/style memory|service|temporarily unavailable|retry/i)
    await expect(failedState.getByRole('button', { name: /retry/i })).toBeVisible()
    await expect(failedState.getByRole('button', { name: /back to workspace/i })).toBeVisible()
    await expect(statePresenter(page, 'empty')).toHaveCount(0)
    await expect(statePresenter(page, 'noResults')).toHaveCount(0)
  })

  test('TC-6.7 auth restricted Style Memory keeps the workspace snapshot and offers login', async ({
    page,
  }) => {
    const workspaceSnapshot = JSON.stringify({
      version: 3,
      assetId: 'persisted-asset-id',
      referenceImageUrl: 'https://cdn.example.com/references/persisted/original.png',
      analysisTaskId: 'persisted-analysis-id',
      promptText: 'Persisted cinematic prompt',
      negativePromptText: 'low quality',
      generationTaskId: null,
    })

    await page.addInitScript(
      ({ key, value }) => window.sessionStorage.setItem(key, value),
      { key: STORAGE_KEY, value: workspaceSnapshot },
    )
    await mockApiError(page, '**/api/templates?**', 401, {
      error: 'Authentication required',
    })

    await openStyleMemory(page)

    const authState = statePresenter(page, 'authRequired')
    await expect(authState).toBeVisible()
    await expect(authState).toContainText(/log in|sign in|login/i)
    await expect(authState.getByRole('button', { name: /log in|sign in|login/i })).toBeVisible()
    await expect(authState.getByRole('button', { name: /back to workspace/i })).toBeVisible()

    const stored = await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY)
    expect(stored).toBe(workspaceSnapshot)
  })
})
