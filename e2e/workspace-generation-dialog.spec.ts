import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAuthSession,
  mockDirectionFeedStateful,
  mockGenerationCreate,
  mockGenerationCreateCapture,
  mockGenerationList,
  mockGenerationPolling,
  mockGenerationPollingSequence,
  type MockDirectionFeedItem,
} from './helpers/mock-api'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

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

/** Render Dock（Prompt and Render 列内的 output-card）是现行生成入口 */
function renderDock(page: Page) {
  return page
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('output-card')
}

function referenceCard(page: Page) {
  return page
    .getByRole('region', { name: 'Reference Canvas column' })
    .getByTestId('reference-card')
}

function directionRail(page: Page) {
  return page.getByTestId('direction-result-rail')
}

/** 方向 feed 条目（plan-05 DirectionIterationListItem DTO） */
function feedItem(id: string, overrides: Partial<MockDirectionFeedItem> = {}): MockDirectionFeedItem {
  return {
    id,
    status: 'completed',
    promptSummary: `Dialog regression iteration ${id}`,
    resultFileUrl: `https://cdn.example.com/results/${id}/result.webp`,
    params: { aspectRatio: '1:1', quality: 'standard' },
    createdAt: '2026-09-01T00:00:00.000Z',
    resultAssetId: `asset-${id}`,
    errorMessage: null,
    ...overrides,
  }
}

async function generateFromRenderDock(page: Page) {
  const generateButton = renderDock(page).getByRole('button', { name: /^Generate$/i })
  await expect(generateButton).toBeVisible({ timeout: 15000 })
  await expect(generateButton).toBeEnabled()
  await generateButton.click()
}

/**
 * plan-07（实现规格 §4）：成功/进行中/失败全部内联呈现于本次结果区，
 * Workspace 成功流程不再打开阻断式 GenerationDialog——本 spec 由旧「弹层呈现」
 * 契约最小对齐为「不弹层 + 内联结果可见」，行为强度不放宽。
 */
test.describe('workspace generation stays inline (legacy dialog regression)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('keeps generation progress inline without a blocking dialog and sends an empty negative prompt', async ({
    page,
  }) => {
    const create = await mockGenerationCreateCapture(page, 'dialog-progress-task')
    await mockGenerationPolling(page, 'dialog-progress-task', {
      id: 'dialog-progress-task',
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'dialog-progress-analysis-task',
      analysisResponse: { ...loadFixture('analysis-completed.json'), negativePromptText: '' },
    })

    await expect(page.getByLabel(/Negative Prompt/i)).toHaveCount(0)
    // 先推进服务端事实：POST 后的下一次 feed 刷新将看到 active
    feed.set({
      completed: [],
      active: feedItem('dialog-progress-task', {
        status: 'processing',
        resultFileUrl: null,
        resultAssetId: null,
      }),
      latestFailure: null,
    })
    await generateFromRenderDock(page)

    // 进行中任务内联进入本次结果区，阻断式弹层不出现（plan-07：全状态内联）
    await expect(
      directionRail(page).getByTestId('direction-active-face'),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('generation-dialog')).toBeHidden()
    await expect.poll(() => create.requests.length).toBeGreaterThan(0)
    expect(create.requests[0].body['negativePromptText']).toBe('')
  })

  test('shows the completed result inline in the direction rail and keeps context (no dialog)', async ({
    page,
  }) => {
    await mockGenerationCreate(page, 'dialog-completed-task')
    await mockGenerationPollingSequence(page, 'dialog-completed-task', [
      { id: 'dialog-completed-task', status: 'processing', resultFileUrl: null, errorMessage: null },
      { ...loadFixture('generation-completed.json'), id: 'dialog-completed-task' },
    ])
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'dialog-completed-analysis-task' })
    feed.set({
      completed: [],
      active: feedItem('dialog-completed-task', {
        status: 'processing',
        resultFileUrl: null,
        resultAssetId: null,
      }),
      latestFailure: null,
    })
    await generateFromRenderDock(page)

    // 终态：成功结果内联进入方向 rail（真实图片），不打开阻断式弹层
    feed.set({
      completed: [feedItem('dialog-completed-task')],
      active: null,
      latestFailure: null,
    })
    await expect(
      page.locator(
        '[data-testid="direction-completed-item"][data-iteration-id="dialog-completed-task"]',
      ),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('generation-dialog')).toBeHidden()

    // 成功后工作区上下文完整保留（无弹层关闭步骤，三栏继续可编辑）
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(referenceCard(page).getByAltText('Reference')).toBeVisible()
    await expect(page.getByTestId('recipe-card')).toContainText('Ocean sunset')
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
  })

  test('shows generation failure inline with a recovery action and preserves editing context', async ({
    page,
  }) => {
    await mockGenerationCreate(page, 'dialog-failed-task')
    // 对齐 GET /api/generation/[id] 详情超集（src/app/api/generation/[id]/route.ts）
    await mockGenerationPolling(page, 'dialog-failed-task', {
      id: 'dialog-failed-task',
      analysisTaskId: 'dialog-failed-analysis-task',
      status: 'failed',
      promptSnapshot: 'A breathtaking sunset over the calm ocean',
      negativePromptSnapshot: 'blurry, low quality, distorted, watermark, text',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'flux.2',
      resultAssetId: null,
      resultFileUrl: null,
      errorMessage: 'Generation service temporarily unavailable',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:05.000Z',
    })
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'dialog-failed-analysis-task' })
    feed.set({
      completed: [],
      active: feedItem('dialog-failed-task', {
        status: 'processing',
        resultFileUrl: null,
        resultAssetId: null,
      }),
      latestFailure: null,
    })
    await generateFromRenderDock(page)

    // 失败内联呈现于本次结果区：截断原因 + 主动恢复入口，不打开弹层（plan-07：失败内联）
    feed.set({
      completed: [],
      active: null,
      latestFailure: feedItem('dialog-failed-task', {
        status: 'failed',
        resultFileUrl: null,
        resultAssetId: null,
        errorMessage: 'Generation service temporarily unavailable',
        createdAt: '2024-01-01T00:00:05.000Z',
      }),
    })
    const failureFace = directionRail(page).getByTestId('direction-failure-face')
    await expect(failureFace).toBeVisible({ timeout: 15000 })
    await expect(failureFace.getByText(/Generation service temporarily unavailable/)).toBeVisible()
    await expect(directionRail(page).getByTestId('direction-failure-retry')).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toBeHidden()

    // 失败不清除编辑上下文：参考、Recipe 与 Prompt 编辑器保持可用
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(referenceCard(page).getByAltText('Reference')).toBeVisible()
    await expect(page.getByTestId('recipe-card')).toContainText('Ocean sunset')
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
  })
})
