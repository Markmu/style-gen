import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'path'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockAuthSession,
  mockGenerationCreate,
  mockGenerationPolling,
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

function promptCard(page: Page) {
  return page.getByRole('region', { name: 'Prompt column' }).getByTestId('prompt-card')
}

test.describe('PLAN-03 prompt editing and floating generation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockCdnImages(page)
  })

  test('TC-3.1 mounts the prompt editor and output parameters inside PromptCard', async ({ page }) => {
    const taskId = 'prompt-editor-completed-task'
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, loadFixture('analysis-completed.json'))

    await openWorkspace(page)
    await uploadReference(page)

    await expect(promptCard(page).getByTestId('unified-prompt-editor')).toBeVisible({ timeout: 15000 })
    await expect(promptCard(page).getByLabel(/full generation prompt/i)).toBeVisible()
    await expect(promptCard(page).getByLabel(/negative prompt/i)).toBeVisible()
    await expect(promptCard(page).getByLabel(/aspect ratio/i)).toBeVisible()
    await expect(promptCard(page).getByLabel(/quality/i)).toBeVisible()
  })

  test('TC-3.2 uses the floating generate button to open the generation dialog', async ({ page }) => {
    const analysisTaskId = 'floating-generate-analysis-task'
    const generationTaskId = 'floating-generate-task'
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, loadFixture('analysis-completed.json'))
    await mockGenerationCreate(page, generationTaskId)
    await mockGenerationPolling(page, generationTaskId, loadFixture('generation-completed.json'))

    await openWorkspace(page)
    await uploadReference(page)

    const generateButton = page.getByTestId('floating-generate-button')
    await expect(generateButton).toBeVisible({ timeout: 15000 })
    await expect(generateButton).toBeEnabled()
    await generateButton.click()

    await expect(page.getByTestId('generation-dialog')).toBeVisible()
    await expect(page.getByText(/generated result/i)).toBeVisible({ timeout: 15000 })
  })
})
