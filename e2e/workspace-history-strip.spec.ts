import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAuthSession,
  mockGenerationCreate,
  mockGenerationPolling,
} from './helpers/mock-api'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const historyItem = {
  id: 'history-generated-1',
  resultFileUrl: 'https://cdn.example.com/generated/history-generated-1/result.webp',
  createdAt: '2024-01-01T00:00:00.000Z',
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

async function mockGenerationHistory(page: Page) {
  await page.route('**/api/generation?**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [historyItem], nextCursor: null }),
      })
      return
    }
    await route.continue()
  })
}

async function mockGenerationDetail(page: Page) {
  const analysis = loadFixture('analysis-completed.json') as {
    recipe: object
  }

  await page.route(`**/api/generation/${historyItem.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: historyItem.id,
        analysisTaskId: 'history-analysis-task',
        status: 'completed',
        promptSnapshot: 'Restored ocean prompt snapshot',
        negativePromptSnapshot: 'low quality, blurry',
        params: { aspectRatio: '16:9', quality: 'hd' },
        modelName: 'flux.2',
        resultAssetId: 'history-result-asset',
        resultFileUrl: historyItem.resultFileUrl,
        recipe: analysis.recipe,
        createdAt: historyItem.createdAt,
        updatedAt: historyItem.createdAt,
      }),
    })
  })
}

test.describe('PLAN-04 history strip and restore', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockCdnImages(page)
    await mockGenerationHistory(page)
    await mockGenerationDetail(page)
  })

  test('TC-4.1 shows a pure history strip after generation completes', async ({ page }) => {
    await mockGenerationCreate(page, 'history-strip-generation-task')
    await mockGenerationPolling(page, 'history-strip-generation-task', {
      ...loadFixture('generation-completed.json'),
      id: 'history-strip-generation-task',
      resultFileUrl: historyItem.resultFileUrl,
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'history-strip-analysis-task' })
    await page
      .getByTestId('output-card')
      .getByRole('button', { name: /^Generate$/i })
      .click()
    // plan-07（实现规格 §4）：成功不再打开生成任务弹层——以状态带进入
    // Result 阶段为完成锚点，Recent iterations 随完成事实刷新
    await page.getByTestId('ai-copilot-ribbon').getByText('Result').first().waitFor({
      timeout: 15000,
    })
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    await expect(page.getByTestId('history-strip')).toBeVisible()
    await expect(page.getByTestId('generate-history-bar')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /open history item/i })).toHaveCount(1)
  })

  test('TC-4.2 and TC-4.3 opens detail and restores a history item', async ({ page }) => {
    await page.goto('/workspace', { waitUntil: 'commit' })

    await expect(page.getByTestId('history-strip')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /open history item/i }).click()

    await expect(page.getByTestId('history-detail-dialog')).toBeVisible()
    await expect(page.getByText('Restored ocean prompt snapshot')).toBeVisible()
    await page.getByRole('button', { name: /restore to workspace/i }).click()

    await expect(page.getByTestId('history-detail-dialog')).toHaveCount(0)
    await expect(page.getByTestId('prompt-card')).toContainText('Restored ocean prompt snapshot')
    // Restore lands the workspace in the editing phase: the AI status header
    // reports analysis_ready (the current phase value for history_restored) and
    // the copilot ribbon's phase metric reads "Editing".
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analysis_ready')
    await expect(page.getByTestId('ai-copilot-ribbon')).toContainText('Editing')
  })
})
