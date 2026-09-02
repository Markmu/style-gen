import { test, expect, type Page } from '@playwright/test'
import {
  mockGenerationPolling,
  mockAuthSession,
  mockGenerationList,
} from './helpers/mock-api'
import {
  completeFullFlow,
  uploadAndStartAnalysis,
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

test.describe('Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    // History strip（底部 Recent iterations）挂载即 GET 生成列表
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('替换Reference清空结果', async ({ page }) => {
    // Complete full flow: upload → analysis → generation result
    // plan-07：成功内联呈现（helper 以状态带 Result 阶段为完成锚点），无弹层关闭步骤
    await completeFullFlow(page, { generationTaskId: 'mock-generation-task-id' })

    // Reference 卡头部 Replace → 重置回 idle
    await referenceColumn(page)
      .getByTestId('reference-card')
      .getByRole('button', { name: 'Replace', exact: true })
      .click()

    // Results should be cleared — back to idle state with drop zone
    await expect(
      referenceColumn(page).getByText('Click or drag to upload a reference image'),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('ai-copilot-ribbon')).toHaveAttribute('data-phase', 'idle')
    await expect(page.getByTestId('ai-copilot-ribbon')).toContainText('Upload a reference image')

    // Recipe and generation result should be gone
    await expect(promptColumn(page).getByTestId('unified-prompt-editor')).toHaveCount(0)
    await expect(generateButton(page)).toBeDisabled()
  })

  /**
   * 旧行为（sessionStorage 持久化之前的版本）：Analyzing 中刷新回到 idle 空态。
   * 现行架构（docs/11 §6.1/§7：use-workspace-state 初始化优先从 sessionStorage
   * 恢复，刷新直接跳转到 analysis_ready）：分析进行中刷新不悬挂在 Analyzing，
   * 而是按快照恢复为可编辑的 analysis_ready，参考图上下文保留。
   * 先用 expect.poll 等待防抖快照（300ms）落盘再刷新，保证恢复路径确定。
   */
  test('Analyzing刷新页面不悬挂：按快照恢复到可编辑状态', async ({ page }) => {
    const STORAGE_KEY = 'style-gen-workspace-state'

    // Polling returns processing forever — analysis never completes
    await uploadAndStartAnalysis(page, { analysisTaskId: 'mock-analysis-task-id' })

    // Wait for the analyzing phase on the AI status header
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analyzing', {
      timeout: 15000,
    })

    // Wait for the debounced workspace snapshot to land before refreshing
    await expect
      .poll(
        () => page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY),
        { timeout: 10000 },
      )
      .not.toBe(null)

    // Refresh the page
    await page.reload()

    // 不再停留在 Analyzing：恢复到 analysis_ready，参考图保留，不回到上传空态
    await expect(page.getByTestId('ai-copilot-ribbon')).toHaveAttribute(
      'data-phase',
      'analysis_ready',
      { timeout: 10000 },
    )
    await expect(page.getByTestId('ai-copilot-ribbon')).toContainText('Editing')
    await expect(referenceColumn(page).getByTestId('reference-card').getByAltText('Reference')).toBeVisible()
    await expect(
      referenceColumn(page).getByText('Click or drag to upload a reference image'),
    ).toHaveCount(0)
  })

  test('快速连续点击生成只发一次请求', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const genTaskId = 'mock-generation-task-id'

    // Track generation POST calls
    let generationPostCount = 0
    await page.route('**/api/generation', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      generationPostCount++
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: genTaskId, status: 'pending' }),
      })
    })

    // Mock generation polling (stays processing)
    await mockGenerationPolling(page, genTaskId, {
      id: genTaskId,
      analysisTaskId,
      status: 'processing',
      promptSnapshot: 'test',
      negativePromptSnapshot: '',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'flux.2',
      resultAssetId: null,
      resultFileUrl: null,
      errorMessage: null,
    })

    // Upload and wait for analysis
    await uploadAndCompleteAnalysis(page, { analysisTaskId })

    // Click generate from the Render Dock; the button switches to the disabled
    // "Rendering..." state while the task is in flight（plan-07：进行中内联
    // 呈现，不再打开生成任务弹窗），so repeat clicks cannot fire another POST.
    await generateButton(page).click()
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'generating',
      { timeout: 15000 },
    )
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
    await expect(renderDock(page).getByRole('button', { name: 'Rendering...' })).toBeDisabled()

    // Only 1 POST request should have been made
    expect(generationPostCount).toBe(1)
  })
})
