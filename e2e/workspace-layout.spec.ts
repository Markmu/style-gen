import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAnalysisPolling,
  mockApiError,
  mockAuthSession,
  mockDirectionFeedStateful,
  mockGenerationCreate,
  mockGenerationList,
  mockGenerationPolling,
  mockGenerationPollingSequence,
  mockUploadPresign,
  type MockDirectionFeedItem,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'
import {
  completeFullFlow,
  gotoWorkspace,
  TEST_IMAGE_PATH,
  uploadAndCompleteAnalysis,
  uploadAndStartAnalysis,
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

/** 现行三栏布局：Reference Canvas / Style Intelligence / Prompt and Render */
function referenceColumn(page: Page) {
  return page.getByRole('region', { name: 'Reference Canvas column' })
}

function styleColumn(page: Page) {
  return page.getByRole('region', { name: 'Style Intelligence column' })
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

/** plan-07：方向 feed 完成条目（结果内联呈现于本次结果区的锚点） */
function layoutRailItem(id: string): MockDirectionFeedItem {
  return {
    id,
    status: 'completed',
    promptSummary: `Layout iteration ${id}`,
    resultFileUrl: `https://cdn.example.com/results/${id}/result.webp`,
    params: { aspectRatio: '1:1', quality: 'standard' },
    createdAt: '2026-09-01T00:00:00.000Z',
    resultAssetId: `asset-${id}`,
    errorMessage: null,
  }
}

test.describe('Workspace Layout & State Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    // History strip（底部 Recent iterations）挂载即 GET 生成列表
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('空态进入：三栏布局 + AI 状态带 + 参考图统一上传入口', async ({ page }) => {
    await gotoWorkspace(page)

    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(page.getByTestId('workspace-two-pane-layout')).toHaveCount(0)

    const referenceCard = referenceColumn(page).getByTestId('reference-card')
    const styleCard = styleColumn(page).getByTestId('recipe-card')
    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(referenceCard).toBeVisible()
    await expect(styleCard).toBeVisible()
    await expect(promptCard).toBeVisible()
    for (const card of [referenceCard, styleCard, promptCard]) {
      await expect(card).toHaveClass(/surface-panel/)
    }

    // 状态带：idle 阶段的 AI Copilot ribbon 指引上传参考图
    const ribbon = page.getByTestId('ai-copilot-ribbon')
    await expect(ribbon).toBeVisible()
    await expect(ribbon).toHaveAttribute('data-phase', 'idle')
    await expect(ribbon).toContainText('Upload a reference image')

    // 上传入口统一收敛在 Reference Canvas 列，其余两栏为空态占位
    await expect(
      referenceColumn(page).getByTestId('reference-upload-dropzone'),
    ).toBeVisible()
    await expect(
      referenceColumn(page).getByText('Click or drag to upload a reference image'),
    ).toBeVisible()
    await expect(styleCard).toContainText('Waiting for style signals')
    await expect(promptCard).toContainText('Prompt will appear here')

    // Render Dock 的 Generate 在空态禁用
    const dock = renderDock(page)
    await expect(dock).toBeVisible()
    await expect(dock).toHaveAttribute('data-readiness-can-generate', 'false')
    await expect(generateButton(page)).toBeDisabled()

    // 底部 Recent iterations 条：空历史占位，Compare 未解锁
    const bottomBar = page.getByTestId('workspace-bottom-bar')
    await expect(bottomBar).toBeVisible()
    await expect(bottomBar.getByTestId('history-strip')).toBeVisible()
    await expect(bottomBar.getByTestId('history-strip')).toContainText(
      'Renders will appear here as visual evidence.',
    )
    await expect(bottomBar.getByRole('button', { name: 'Compare' })).toBeDisabled()
    await expect(bottomBar.getByRole('button', { name: 'View all' })).toBeVisible()

    const layoutBox = await page.getByTestId('workspace-three-column-layout').boundingBox()
    const barBox = await bottomBar.boundingBox()
    expect(layoutBox).not.toBeNull()
    expect(barBox).not.toBeNull()
    if (layoutBox && barBox) {
      expect(barBox.y).toBeGreaterThanOrEqual(layoutBox.y + layoutBox.height - 4)
    }
  })

  test('Analyzing状态展示进度', async ({ page }) => {
    await uploadAndStartAnalysis(page, { analysisTaskId: 'layout-processing-task' })

    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analyzing', {
      timeout: 15000,
    })
    const ribbon = page.getByTestId('ai-copilot-ribbon')
    await expect(ribbon).toContainText('Reading')
    await expect(ribbon).toContainText('AI is extracting style signals')
    // 三栏保持挂载，Style Intelligence 与 Prompt 列展示加载骨架
    await expect(referenceColumn(page).getByTestId('reference-card')).toBeVisible()
    await expect(styleColumn(page).getByTestId('recipe-card')).toBeVisible()
    await expect(promptColumn(page).getByTestId('prompt-card')).toBeVisible()
    await expect(page.getByLabel('Visual Recipe loading')).toBeVisible()
    await expect(page.getByLabel('Prompt loading')).toBeVisible()
  })

  test('上传并分析后展示风格拆解、统一 Prompt 编辑器和生成按钮', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'layout-ready-task' })

    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'analysis_ready',
    )
    await expect(page.getByTestId('ai-copilot-ribbon')).toContainText('Editing')

    const referenceCard = referenceColumn(page).getByTestId('reference-card')
    const styleCard = styleColumn(page).getByTestId('recipe-card')
    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(referenceCard.getByAltText('Reference')).toBeVisible()

    // 风格拆解：Content（主体/场景/图像摘要）+ 五个结构化维度 + 风格指纹
    await expect(styleCard.getByTestId('content-analysis')).toContainText('Ocean sunset')
    await styleCard.getByTestId('content-analysis').click()
    await expect(styleCard.getByTestId('style-intelligence-image-summary')).toContainText(
      'A vibrant sunset over the ocean',
    )
    await expect(styleCard.getByTestId('style-dna')).toContainText('5 dimensions')
    for (const dimension of ['color', 'composition', 'lighting', 'texture', 'mood']) {
      await expect(styleCard.getByTestId(`evidence-facet-${dimension}`)).toBeVisible()
    }
    await expect(styleCard).toContainText('Style fingerprint')

    await expect(promptCard.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(promptCard.getByLabel('Full Generation Prompt')).not.toBeEmpty()
    await expect(generateButton(page)).toBeEnabled()
  })

  test('生成图片：内联进度、结果图进入结果区、上下文保留', async ({ page }) => {
    // plan-07：成功/进行中全部内联——stateful feed 提供结果锚点，不打开弹层
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })
    await mockGenerationCreate(page, 'layout-generation-task')
    await mockGenerationPollingSequence(page, 'layout-generation-task', [
      { id: 'layout-generation-task', status: 'processing', resultFileUrl: null, errorMessage: null },
      { ...loadFixture('generation-completed.json'), id: 'layout-generation-task' },
    ])

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'layout-generation-analysis-task' })

    // 提交前预置服务端 active 事实：POST 后的失效回读把 active 带入本次结果区，
    // 并启动 active 存在时的 2-3s 定时刷新（终态由定时刷新拾取）
    feed.set({
      completed: [],
      active: {
        id: 'layout-generation-task',
        status: 'processing',
        promptSummary: 'Layout in-flight generation',
        resultFileUrl: null,
        params: { aspectRatio: '1:1', quality: 'standard' },
        createdAt: '2026-09-01T00:00:04.000Z',
        resultAssetId: null,
        errorMessage: null,
      },
      latestFailure: null,
    })
    await generateButton(page).click()

    // 进行中内联：阶段进入 generating，无阻断弹层
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'generating',
      { timeout: 15000 },
    )
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    // 终态内联：新成功进入本次结果区（真实图片）并成为当前选择
    feed.set({
      completed: [layoutRailItem('layout-generation-task')],
      active: null,
      latestFailure: null,
    })
    const completedItem = page.locator(
      '[data-testid="direction-completed-item"][data-iteration-id="layout-generation-task"]',
    )
    await expect(completedItem).toBeVisible({ timeout: 15000 })
    await expect(completedItem.locator('img')).toBeVisible()

    // 完成后停留在 Result 阶段，三栏编辑上下文完整保留（无弹层关闭步骤）
    await expect(page.getByTestId('ai-copilot-ribbon')).toContainText('Result')
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(referenceColumn(page).getByTestId('reference-card').getByAltText('Reference')).toBeVisible()
    await expect(styleColumn(page).getByTestId('recipe-card')).toContainText('Ocean sunset')
    await expect(
      promptColumn(page).getByTestId('prompt-card').getByTestId('unified-prompt-editor'),
    ).toBeVisible()
    await expect(generateButton(page)).toBeVisible()
    await expect(generateButton(page)).toBeEnabled()
  })

  test('迭代重新生成会发送修改后的 Prompt', async ({ page }) => {
    let generationPostCount = 0
    let capturedPrompt = ''

    await page.route('**/api/generation', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      generationPostCount += 1
      const taskId =
        generationPostCount === 1
          ? 'layout-generation-first-task'
          : 'layout-generation-second-task'
      const body = route.request().postDataJSON() as { promptText?: string }
      capturedPrompt = body.promptText ?? ''
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: taskId, status: 'pending' }),
      })
    })

    // plan-07：两次完成事实经方向 feed 内联呈现
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })
    await mockGenerationPolling(page, 'layout-generation-first-task', {
      ...loadFixture('generation-completed.json'),
      id: 'layout-generation-first-task',
    })
    await mockGenerationPolling(page, 'layout-generation-second-task', {
      ...loadFixture('generation-completed.json'),
      id: 'layout-generation-second-task',
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'layout-iteration-analysis-task' })
    await generateButton(page).click()
    feed.set({
      completed: [layoutRailItem('layout-generation-first-task')],
      active: null,
      latestFailure: null,
    })
    await expect(
      page.locator(
        '[data-testid="direction-completed-item"][data-iteration-id="layout-generation-first-task"]',
      ),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    await page.getByLabel('Full Generation Prompt').fill('A vibrant sunrise over the mountains with mist')
    await generateButton(page).click()

    feed.set({
      completed: [
        layoutRailItem('layout-generation-second-task'),
        layoutRailItem('layout-generation-first-task'),
      ],
      active: null,
      latestFailure: null,
    })
    await expect(
      page.locator(
        '[data-testid="direction-completed-item"][data-iteration-id="layout-generation-second-task"]',
      ),
    ).toBeVisible({ timeout: 15000 })
    expect(capturedPrompt).toBe('A vibrant sunrise over the mountains with mist')
  })

  test('Replace Reference会重置Workspace状态', async ({ page }) => {
    await completeFullFlow(page, { generationTaskId: 'layout-reset-generation-task' })

    await page.getByRole('button', { name: 'Replace', exact: true }).click()

    await expect(
      referenceColumn(page).getByText('Click or drag to upload a reference image'),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('ai-copilot-ribbon')).toHaveAttribute('data-phase', 'idle')
    await expect(page.getByTestId('ai-copilot-ribbon')).toContainText('Upload a reference image')
    await expect(styleColumn(page).getByTestId('recipe-card')).toContainText(
      'Waiting for style signals',
    )
    await expect(promptColumn(page).getByTestId('prompt-card')).toContainText(
      'Prompt will appear here',
    )
    await expect(promptColumn(page).getByTestId('unified-prompt-editor')).toHaveCount(0)
    await expect(generateButton(page)).toBeDisabled()
  })

  test('分析失败后可以Retry并恢复到Ready to Generate状态', async ({ page }) => {
    await mockUploadPresign(page)

    const taskId = 'layout-retry-analysis-task'
    const analysisCompleted = loadFixture('analysis-completed.json')
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
            error: 'Vision Analysis Failed',
            code: 'VISION_FAILED',
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
    await mockAnalysisPolling(page, taskId, analysisCompleted)

    await gotoWorkspace(page)
    const referenceInput = referenceColumn(page).locator('input[type="file"]')
    await waitForReactInput(referenceInput)
    await referenceInput.setInputFiles(TEST_IMAGE_PATH)

    // 失败保留参考图上下文，并提供 Retry analysis 入口
    await expect(
      referenceColumn(page).getByText('Vision Analysis Failed').first(),
    ).toBeVisible({ timeout: 15000 })
    await expect(referenceColumn(page).getByAltText('Reference')).toBeVisible()
    await referenceColumn(page).getByRole('button', { name: 'Retry analysis' }).click()

    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'analysis_ready',
      { timeout: 15000 },
    )
    await expect(page.getByTestId('ai-copilot-ribbon')).toContainText('Editing')
    await expect(page.getByLabel('Full Generation Prompt')).not.toBeEmpty()
  })

  test('Generation Failed后保留 Prompt 和编辑上下文', async ({ page }) => {
    await mockApiError(page, '**/api/generation', 500, {
      error: 'Service Temporarily Unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'layout-generation-error-analysis-task' })
    await generateButton(page).click()

    // plan-07（§8.2 L5）：提交失败内联呈现 + 主动重试，不打开阻断式弹层
    const submitError = page.getByTestId('generation-submit-error')
    await expect(submitError).toBeVisible({ timeout: 15000 })
    await expect(submitError).toContainText('Service Temporarily Unavailable')
    await expect(page.getByTestId('generation-submit-retry')).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(promptCard.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(promptCard.getByLabel('Full Generation Prompt')).not.toBeEmpty()
    await expect(promptCard.getByLabel('Full Generation Prompt')).toBeEditable()
  })
})
