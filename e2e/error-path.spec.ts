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

  // plan-07（实现规格 §4 / §8.2 L5）：生成提交失败不再打开阻断式 GenerationDialog，
  // 改为内联 `generation-submit-error` + `generation-submit-retry`——不声称任务已
  // 创建、草稿与参数保留。本两条由旧「失败弹层」断言最小对齐为内联失败断言，
  // 行为强度不放宽（错误可见 + 恢复入口 + 编辑上下文保留）。
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

    // 生成提交失败以内联错误位展示服务端错误文本，不打开阻断式弹层
    const submitError = page.getByTestId('generation-submit-error')
    await expect(submitError).toBeVisible({ timeout: 15000 })
    await expect(submitError).toContainText('Service Temporarily Unavailable')
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
  })

  test('Generation Failed保留 Prompt 和Retry入口', async ({ page }) => {
    await mockApiError(page, '**/api/generation', 500, {
      error: 'Service Temporarily Unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'mock-analysis-task-id' })
    await generateButton(page).click()

    // 失败内联呈现：错误文本 + 主动重试入口（创建新任务），不打开弹层
    const submitError = page.getByTestId('generation-submit-error')
    await expect(submitError).toBeVisible({ timeout: 15000 })
    await expect(submitError).toContainText('Service Temporarily Unavailable')
    await expect(page.getByTestId('generation-submit-retry')).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    // 提交失败不清除编辑上下文：Prompt 编辑器仍在且内容未丢
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
