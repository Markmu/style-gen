import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'path'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockAuthSession,
  mockGenerationList,
  mockUploadPresign,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const orderedFacetIds = ['color', 'composition', 'lighting', 'texture', 'mood']

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
  await appShell(page).locator('input[type="file"]').first().setInputFiles(TEST_IMAGE_PATH)
}

function appShell(page: Page) {
  return page.getByTestId('app-shell')
}

function referenceCard(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Reference Canvas column' })
    .getByTestId('reference-card')
}

function styleIntelligence(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Style Intelligence column' })
    .getByTestId('recipe-card')
}

function promptCard(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('prompt-card')
}

async function mockCompletedAnalysis(page: Page, taskId: string, response = loadFixture('analysis-completed.json')) {
  await mockUploadPresign(page)
  await mockAnalysisCreate(page, taskId)
  await mockAnalysisPolling(page, taskId, response)
}

test.describe('plan-03 Workspace Reference / Evidence / Prompt AI-first contract', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('TC-3.1 empty workspace explains the AI style signals it will read', async ({ page }) => {
    await openWorkspace(page)

    await expect(appShell(page).getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(referenceCard(page)).toBeVisible()
    await expect(styleIntelligence(page)).toBeVisible()
    await expect(promptCard(page)).toBeVisible()

    const reference = referenceCard(page)
    for (const signal of ['color', 'composition', 'lighting', 'texture', 'mood']) {
      await expect(reference).toContainText(new RegExp(signal, 'i'))
    }
    await expect(page.getByRole('link', { name: /style memory/i })).toBeVisible()
  })

  test('TC-3.2 completed analysis renders stable ordered evidence facets', async ({ page }) => {
    const taskId = 'ai-first-evidence-completed'
    await mockCompletedAnalysis(page, taskId)

    await openWorkspace(page)
    await uploadReference(page)
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analysis_ready', {
      timeout: 15000,
    })
    await expect(referenceCard(page).getByAltText('Reference')).toHaveCSS('object-fit', 'cover')

    const facetIds = await styleIntelligence(page)
      .locator('[data-testid^="evidence-facet-"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-testid')?.replace('evidence-facet-', '')),
      )

    expect(facetIds).toEqual(orderedFacetIds)

    for (const facetId of orderedFacetIds) {
      const facet = styleIntelligence(page).getByTestId(`evidence-facet-${facetId}`)
      await expect(facet).toBeVisible()
      await expect(facet).toHaveAttribute('data-source-field', facetId)
      await expect(facet.getByText(/AI|\d+%/)).toBeVisible()
    }
  })

  test('TC-3.3 selected facet highlights linked prompt text without inventing image coordinates', async ({ page }) => {
    const taskId = 'ai-first-evidence-linked-selection'
    await mockCompletedAnalysis(page, taskId)

    await openWorkspace(page)
    await uploadReference(page)
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analysis_ready', {
      timeout: 15000,
    })

    const lightingFacet = styleIntelligence(page).getByTestId('evidence-facet-lighting')
    await expect(lightingFacet).toBeVisible({ timeout: 5000 })
    await lightingFacet.click()

    await expect(lightingFacet).toHaveAttribute('data-selected', 'true')
    await expect(referenceCard(page).locator('[data-testid^="reference-anchor-"]')).toHaveCount(0)
    await expect(promptCard(page).getByTestId('prompt-provenance-span-lighting')).toBeVisible()
  })

  test('TC-3.4 unmatched prompt text does not create an external prompt chip', async ({ page }) => {
    const taskId = 'ai-first-evidence-facet-only'
    const completed = loadFixture('analysis-completed.json') as {
      recipe: Record<string, unknown>
      promptText: string
    }
    const facetOnlyResponse = {
      ...completed,
      promptText: 'Minimal studio product render with neutral framing and crisp edge detail.',
      recipe: {
        ...completed.recipe,
        texture: 'powdered terrazzo grain with pearlescent micro scratches',
      },
    }
    await mockCompletedAnalysis(page, taskId, facetOnlyResponse)

    await openWorkspace(page)
    await uploadReference(page)
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analysis_ready', {
      timeout: 15000,
    })

    const textureFacet = styleIntelligence(page).getByTestId('evidence-facet-texture')
    await expect(textureFacet).toBeVisible({ timeout: 5000 })
    await textureFacet.click()

    await expect(promptCard(page).getByTestId('text-mode-highlight-editor')).toBeVisible()
    await expect(promptCard(page).getByTestId('prompt-provenance-facet-only-texture')).toHaveCount(0)
  })

  test('TC-3.5 retryable analysis failure preserves context and recovery actions', async ({ page }) => {
    await mockUploadPresign(page)
    await page.route('**/api/analysis', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Analysis provider temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
          retryable: true,
        }),
      })
    })

    await openWorkspace(page)
    await uploadReference(page)

    const reference = referenceCard(page)
    await expect(reference.getByAltText('Reference')).toBeVisible({ timeout: 15000 })
    await expect(reference).toContainText(/context|preserved|保留/i)
    await expect(reference.getByRole('button', { name: /retry analysis/i })).toBeVisible()
    await expect(reference.getByRole('button', { name: /replace/i })).toBeVisible()
    await expect(promptCard(page)).toContainText(/prompt context|back to edit|保留/i)
    await expect(page.getByRole('button', { name: /back to edit/i })).toBeVisible()
  })
})
