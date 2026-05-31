import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'path'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockAuthSession,
  mockUploadPresign,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

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
  const chooserPromise = page.waitForEvent('filechooser')
  await page
    .getByRole('region', { name: 'Reference column' })
    .getByText('Click or drag to upload a reference image')
    .click()
  const chooser = await chooserPromise
  await chooser.setFiles(TEST_IMAGE_PATH)
}

function referenceCard(page: Page) {
  return page.getByRole('region', { name: 'Reference column' }).getByTestId('reference-card')
}

function recipeCard(page: Page) {
  return page.getByRole('region', { name: 'Visual Recipe column' }).getByTestId('recipe-card')
}

test.describe('PLAN-02 reference and visual recipe cards', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockCdnImages(page)
  })

  test('TC-2.1 and TC-2.2 show the reference image with five analysis dimensions', async ({ page }) => {
    const taskId = 'reference-recipe-completed-task'
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, loadFixture('analysis-completed.json'))

    await openWorkspace(page)
    await uploadReference(page)

    await expect(referenceCard(page).getByAltText('Reference')).toBeVisible({ timeout: 15000 })
    for (const label of ['Style', 'Material', 'Lighting', 'Composition', 'Mood']) {
      await expect(referenceCard(page).getByText(label, { exact: true })).toBeVisible()
    }
    await expect(referenceCard(page).getByRole('link', { name: /view full analysis/i })).toBeVisible()
  })

  test('TC-2.3 renders five structured recipe categories after analysis', async ({ page }) => {
    const taskId = 'recipe-categories-completed-task'
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, loadFixture('analysis-completed.json'))

    await openWorkspace(page)
    await uploadReference(page)

    for (const label of [
      'Structure',
      'Materials',
      'Lighting',
      'Color Palette',
      'Mood & Atmosphere',
    ]) {
      await expect(recipeCard(page).getByText(label, { exact: true })).toBeVisible({ timeout: 15000 })
    }
    await expect(recipeCard(page).getByRole('button', { name: /copy recipe to prompt/i })).toBeVisible()
  })
})
