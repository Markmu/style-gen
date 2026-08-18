import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'path'
import {
  mockAnalysisPolling,
  mockApiError,
  mockAuthSession,
  mockGenerationList,
  mockUploadPresign,
  loadFixture,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'
import {
  gotoWorkspace,
  TEST_IMAGE_PATH,
  uploadAndCompleteAnalysis,
} from './helpers/workspace-actions'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

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

/** 现行三栏布局：Reference Canvas / Prompt and Render */
function referenceColumn(page: Page) {
  return page.getByRole('region', { name: 'Reference Canvas column' })
}

function promptColumn(page: Page) {
  return page.getByRole('region', { name: 'Prompt and Render column' })
}

/** 现行生成入口：Prompt and Render 列内的 Render Dock（output-card） */
function renderDock(page: Page) {
  return promptColumn(page).getByTestId('output-card')
}

function generateButton(page: Page) {
  return renderDock(page).getByRole('button', { name: /^Generate$/i })
}

test.describe('Error Path', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    // History strip（底部 Recent iterations）挂载即 GET 生成列表
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('上传不支持的文件类型', async ({ page }) => {
    await page.goto('/workspace')

    // The file input has accept attribute limiting types
    // Playwright setInputFiles bypasses browser accept, but the component validates
    const textFilePath = resolve(__dirname, 'fixtures/test-file.txt')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(textFilePath)

    // Should show error — the file validation in UploadZone rejects non-image types
    // .txt file has type 'text/plain' which is not in ACCEPTED_TYPES
    await expect(page.getByText('Only JPG, PNG, and WebP images are supported')).toBeVisible({ timeout: 5000 })
  })

  test('分析 API 失败展示错误', async ({ page }) => {
    // Mock upload success
    await mockUploadPresign(page)

    // Mock analysis POST returning 500
    await mockApiError(page, '**/api/analysis', 500, {
      error: 'Service Temporarily Unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Should show error display with title (in <p> not heading)
    await expect(page.getByText('Service Temporarily Unavailable').first()).toBeVisible({ timeout: 15000 })
  })

  test('分析失败后Retry', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)

    // First analysis call fails, second succeeds
    let analysisCallCount = 0
    await page.route('**/api/analysis', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      analysisCallCount += 1
      if (analysisCallCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Service Temporarily Unavailable',
            code: 'SERVICE_UNAVAILABLE',
            retryable: true,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: taskId, status: 'pending' }),
      })
    })

    // Mock polling for success
    await mockAnalysisPolling(page, taskId, analysisCompleted)

    await gotoWorkspace(page)
    const referenceInput = referenceColumn(page).locator('input[type="file"]')
    await waitForReactInput(referenceInput)
    await referenceInput.setInputFiles(TEST_IMAGE_PATH)

    // 失败三段式：错误信息 + Retry analysis 入口，参考图上下文保留
    const referenceCard = referenceColumn(page).getByTestId('reference-card')
    await expect(
      referenceCard.getByText('Service Temporarily Unavailable').first(),
    ).toBeVisible({ timeout: 15000 })
    const retryBtn = referenceCard.getByRole('button', { name: 'Retry analysis' })
    await expect(retryBtn).toBeVisible()
    await retryBtn.click()

    // Retry 后分析完成，恢复到 Ready to Generate（analysis_ready + Prompt 已就绪）
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'analysis_ready',
      { timeout: 15000 },
    )
    await expect(promptColumn(page).getByLabel('Full Generation Prompt')).not.toBeEmpty()
    expect(analysisCallCount).toBe(2)
  })

  test('生成 API 失败展示错误', async ({ page }) => {
    // Mock generation POST returning 500
    await mockApiError(page, '**/api/generation', 500, {
      error: 'Service Temporarily Unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    // Upload and wait for analysis
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'mock-analysis-task-id' })

    // Click generate from the Render Dock
    await generateButton(page).click()

    // 生成任务弹窗以失败态展示错误标题与信息
    await expect(page.getByRole('dialog', { name: 'Generation Task' })).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toContainText('Generation Failed', {
      timeout: 15000,
    })
    await expect(page.getByTestId('generation-dialog')).toContainText(
      'Service Temporarily Unavailable',
    )
  })

  test('Generation Failed保留 Prompt 和Retry入口', async ({ page }) => {
    await mockApiError(page, '**/api/generation', 500, {
      error: 'Service Temporarily Unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'mock-analysis-task-id' })
    await generateButton(page).click()

    // 失败弹窗保留 Retry 入口（Regenerate）
    const dialog = page.getByTestId('generation-dialog')
    await expect(dialog).toContainText('Generation Failed', { timeout: 15000 })
    await expect(dialog).toContainText('Service Temporarily Unavailable')
    await expect(dialog.getByRole('button', { name: 'Regenerate' })).toBeVisible()

    // Back to Edit 后 Prompt 编辑器仍在且内容未丢
    await page.getByRole('button', { name: 'Back to Edit' }).click()
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(promptCard.getByTestId('unified-prompt-editor')).toBeVisible()
    const promptTextarea = promptCard.getByLabel('Full Generation Prompt')
    await expect(promptTextarea).not.toBeEmpty()
  })

  test('限流触发展示等待提示', async ({ page }) => {
    // Mock upload success
    await mockUploadPresign(page)

    // Mock analysis POST returning 429
    await page.route('**/api/analysis', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Too many requests. Please try again later.',
            code: 'RATE_LIMITED',
            retryable: true,
          }),
          headers: { 'Retry-After': '60' },
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Should show rate limit error title
    await expect(page.getByText('Too Many Requests').first()).toBeVisible({ timeout: 15000 })
  })
})
