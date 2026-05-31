import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'path'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockAnalysisPollingSequence,
  mockAuthSession,
  mockUploadPresign,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')
const STORAGE_KEY = 'style-gen-workspace-state'

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
  await page
    .getByRole('region', { name: 'Reference column' })
    .locator('input[type="file"]')
    .setInputFiles(TEST_IMAGE_PATH)
}

function visibleByTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]:visible`).first()
}

function referenceCard(page: Page) {
  return page.getByRole('region', { name: 'Reference column' }).getByTestId('reference-card')
}

function recipeCard(page: Page) {
  return page.getByRole('region', { name: 'Visual Recipe column' }).getByTestId('recipe-card')
}

function promptCard(page: Page) {
  return page.getByRole('region', { name: 'Prompt column' }).getByTestId('prompt-card')
}

async function expectModeSelected(page: Page, modeName: 'Analyze' | 'Editing' | 'Generate' | 'Result') {
  await expect(
    visibleByTestId(page, 'top-mode-switcher').getByRole('button', { name: modeName }),
  ).toHaveAttribute('aria-pressed', 'true')
}

test.describe('PLAN-01 three column workspace layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
  })

  test('TC-1.1 renders the empty workspace as a three column skeleton', async ({ page }) => {
    await openWorkspace(page)

    await expect(visibleByTestId(page, 'workspace-three-column-layout')).toBeVisible()
    await expect(page.getByTestId('workspace-two-pane-layout')).toHaveCount(0)
    await expect(referenceCard(page)).toBeVisible()
    await expect(recipeCard(page)).toBeVisible()
    await expect(promptCard(page)).toBeVisible()
    await expect(referenceCard(page)).toContainText(/Reference/i)
    await expect(recipeCard(page)).toContainText(/Visual Recipe/i)
    await expect(promptCard(page)).toContainText(/Prompt/i)
    await expect(visibleByTestId(page, 'top-mode-switcher')).toBeVisible()
    await expectModeSelected(page, 'Analyze')
    await expect(visibleByTestId(page, 'top-mode-switcher').getByRole('button', { name: 'Editing' })).toBeDisabled()
    await expect(visibleByTestId(page, 'top-mode-switcher').getByRole('button', { name: 'Generate' })).toBeDisabled()
    await expect(visibleByTestId(page, 'top-mode-switcher').getByRole('button', { name: 'Result' })).toBeDisabled()
  })

  test('TC-1.2 keeps the three cards mounted while upload and analysis are processing', async ({ page }) => {
    const taskId = 'three-column-processing-task'
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPollingSequence(page, taskId, [
      {
        id: taskId,
        status: 'processing',
        recipe: null,
        promptText: null,
        negativePromptText: null,
        errorMessage: null,
        errorStage: null,
      },
    ])

    await openWorkspace(page)
    await uploadReference(page)

    await expect(visibleByTestId(page, 'workspace-three-column-layout')).toBeVisible({ timeout: 15000 })
    await expect(referenceCard(page)).toBeVisible()
    await expect(recipeCard(page)).toBeVisible()
    await expect(promptCard(page)).toBeVisible()
    await expectModeSelected(page, 'Analyze')
  })

  test('TC-1.3 maps completed analysis to Editing mode without changing the layout', async ({ page }) => {
    const taskId = 'three-column-completed-task'
    await mockCdnImages(page)
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, loadFixture('analysis-completed.json'))

    await openWorkspace(page)
    await uploadReference(page)

    await expect(visibleByTestId(page, 'workspace-three-column-layout')).toBeVisible({ timeout: 15000 })
    await expect(referenceCard(page)).toBeVisible()
    await expect(recipeCard(page)).toBeVisible()
    await expect(promptCard(page)).toBeVisible()
    await expectModeSelected(page, 'Editing')
  })

  test('TC-1.4 lets manual mode clicks change highlight without resetting workspace data', async ({ page }) => {
    const taskId = 'three-column-manual-mode-task'
    await mockCdnImages(page)
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, loadFixture('analysis-completed.json'))

    await openWorkspace(page)
    await uploadReference(page)
    await expectModeSelected(page, 'Editing')

    await visibleByTestId(page, 'top-mode-switcher').getByRole('button', { name: 'Analyze' }).click()
    await expectModeSelected(page, 'Analyze')
    await expect(referenceCard(page)).toBeVisible()
    await expect(promptCard(page)).toBeVisible()

    await visibleByTestId(page, 'top-mode-switcher').getByRole('button', { name: 'Generate' }).click()
    await expectModeSelected(page, 'Generate')
    await expect(referenceCard(page)).toBeVisible()
    await expect(promptCard(page)).toBeVisible()
  })

  for (const width of [1280, 1440]) {
    test(`TC-1.5 keeps the 1:1:1.2 column rhythm at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openWorkspace(page)

      await expect(referenceCard(page)).toBeVisible({ timeout: 5000 })
      await expect(recipeCard(page)).toBeVisible({ timeout: 5000 })
      await expect(promptCard(page)).toBeVisible({ timeout: 5000 })

      const referenceBox = await referenceCard(page).boundingBox()
      const recipeBox = await recipeCard(page).boundingBox()
      const promptBox = await promptCard(page).boundingBox()

      expect(referenceBox).not.toBeNull()
      expect(recipeBox).not.toBeNull()
      expect(promptBox).not.toBeNull()
      if (referenceBox && recipeBox && promptBox) {
        const recipeRatio = recipeBox.width / referenceBox.width
        const promptRatio = promptBox.width / referenceBox.width
        expect(recipeRatio).toBeGreaterThan(0.92)
        expect(recipeRatio).toBeLessThan(1.08)
        expect(promptRatio).toBeGreaterThan(1.1)
        expect(promptRatio).toBeLessThan(1.35)
        expect(Math.abs(recipeBox.x - (referenceBox.x + referenceBox.width + 16))).toBeLessThanOrEqual(6)
        expect(Math.abs(promptBox.x - (recipeBox.x + recipeBox.width + 16))).toBeLessThanOrEqual(6)
      }
    })
  }

  test('TC-1.6 clears damaged sessionStorage and still renders idle three column state', async ({ page }) => {
    await page.addInitScript((storageKey) => {
      window.sessionStorage.setItem(storageKey, '{broken-json')
    }, STORAGE_KEY)

    await openWorkspace(page)

    await expect(visibleByTestId(page, 'workspace-three-column-layout')).toBeVisible()
    await expectModeSelected(page, 'Analyze')
    await expect(referenceCard(page)).toContainText(/upload|reference/i)
    await expect(
      page.evaluate((storageKey) => window.sessionStorage.getItem(storageKey), STORAGE_KEY),
    ).resolves.not.toBe('{broken-json')
  })
})
