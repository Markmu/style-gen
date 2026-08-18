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
import { waitForReactInput } from './helpers/react-ready'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** 现行 Style Intelligence 的五个结构化维度（legacy 配方派生，subject 单列于 Content） */
const STYLE_DIMENSIONS: Array<{ id: string; label: string }> = [
  { id: 'color', label: 'Color' },
  { id: 'composition', label: 'Composition' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'texture', label: 'Texture' },
  { id: 'mood', label: 'Mood' },
]

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
  const input = page
    .getByRole('region', { name: 'Reference Canvas column' })
    .locator('input[type="file"]')
  await waitForReactInput(input)
  await input.setInputFiles(TEST_IMAGE_PATH)
}

function referenceCard(page: Page) {
  return page.getByRole('region', { name: 'Reference Canvas column' }).getByTestId('reference-card')
}

/** 参考图分析维度与结构化配方现统一收敛在 Style Intelligence 列 */
function styleIntelligence(page: Page) {
  return page.getByRole('region', { name: 'Style Intelligence column' }).getByTestId('recipe-card')
}

function promptCard(page: Page) {
  return page
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('prompt-card')
}

test.describe('PLAN-02 reference and visual recipe cards', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
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
    for (const dimension of STYLE_DIMENSIONS) {
      const facet = styleIntelligence(page).getByTestId(`evidence-facet-${dimension.id}`)
      await expect(facet).toBeVisible({ timeout: 15000 })
      await expect(facet).toHaveAttribute('data-source-field', dimension.id)
    }
    // 完整分析按需展开：点开维度查看该维度的分析摘要（替代旧 "view full analysis" 链接）
    const lightingFacet = styleIntelligence(page).getByTestId('evidence-facet-lighting')
    await lightingFacet.click()
    await expect(lightingFacet).toHaveAttribute('aria-expanded', 'true')
    await expect(styleIntelligence(page).getByTestId('evidence-summary-lighting')).toContainText(
      'Golden hour, warm backlight',
    )
  })

  test('TC-2.3 renders five structured recipe dimensions after analysis', async ({ page }) => {
    const taskId = 'recipe-categories-completed-task'
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, loadFixture('analysis-completed.json'))

    await openWorkspace(page)
    await uploadReference(page)

    await expect(styleIntelligence(page).getByTestId('style-dna')).toContainText('5 dimensions', {
      timeout: 15000,
    })
    for (const dimension of STYLE_DIMENSIONS) {
      await expect(
        styleIntelligence(page)
          .getByTestId(`evidence-facet-${dimension.id}`)
          .getByText(dimension.label, { exact: true }),
      ).toBeVisible()
    }
    // 配方→提示词的流转已自动化：结构化配方分析结果直接落在提示词编辑器中
    await expect(promptCard(page).getByLabel(/full generation prompt/i)).toHaveValue(/sunset/i, {
      timeout: 15000,
    })
  })
})
