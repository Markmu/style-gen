import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockAuthSession,
  mockDirectionFeedStateful,
  mockGenerationCreate,
  mockGenerationList,
  mockGenerationPolling,
  mockUploadPresign,
  type MockDirectionFeedItem,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'
import { gotoWorkspace, TEST_IMAGE_PATH, uploadAndCompleteAnalysis } from './helpers/workspace-actions'

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

/** 现行生成入口：Prompt and Render 列 Render Dock（output-card）内的 Generate 按钮 */
function generateButton(page: Page) {
  return promptColumn(page).getByTestId('output-card').getByRole('button', { name: /^Generate$/i })
}

/** plan-07：方向 feed 完成条目（结果内联呈现于本次结果区的锚点） */
function railItem(id: string): MockDirectionFeedItem {
  return {
    id,
    status: 'completed',
    promptSummary: `Happy path iteration ${id}`,
    resultFileUrl: `https://cdn.example.com/results/${id}/result.webp`,
    params: { aspectRatio: '1:1', quality: 'standard' },
    createdAt: '2026-09-01T00:00:00.000Z',
    resultAssetId: `asset-${id}`,
    errorMessage: null,
  }
}

const processingAnalysisResponse = {
  status: 'processing',
  recipe: null,
  promptText: null,
  negativePromptText: null,
  errorMessage: null,
  errorStage: null,
}

test.describe('Happy Path', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    // History strip（底部 Recent iterations）挂载即 GET 生成列表
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('Home上传Reference跳转工作区', async ({ page }) => {
    // 落地页上传后跳转工作台，工作台会自动消费暂存参考图并开始分析，一并 mock 住
    const taskId = 'happy-landing-analysis-task'
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, processingAnalysisResponse)

    // 预热 /workspace 路由：本用例是套件中首个进入工作台的测试，若跳转时才懒编译
    // /workspace，dev server 的 Fast Refresh 会整页刷新并把进行中的客户端导航打回
    // 首页。先直接访问一次工作台完成编译，再回到落地页执行被测的上传→跳转链路。
    await gotoWorkspace(page)

    // Go to home page（现行 hero 主标题：Reference -> Evidence -> Render）
    await page.goto('/')
    await expect(
      page.getByRole('heading', { level: 1, name: /Reference\s*->\s*Evidence\s*->\s*Render/ }),
    ).toBeVisible()

    // Wait for session to load (AuthHeader shows UserMenu instead of LoginButton)
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible({ timeout: 10000 })

    // Upload via the landing UploadEntry file input
    const fileInput = page.locator('input[type="file"]').first()
    await waitForReactInput(fileInput)
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Should navigate to workspace（现行工作台为三栏布局）
    await page.waitForURL('**/workspace', { timeout: 10000 })
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible({ timeout: 15000 })
  })

  test('工作区上传后自动分析展示配方', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'happy-analysis-task' })

    // 旧「Ready to Generate」的现行等价物：状态带进入 analysis_ready 阶段
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analysis_ready')

    // 配方呈现：Content 摘要（主体）+ 五维 Style DNA 证据
    const styleCard = styleColumn(page).getByTestId('recipe-card')
    await expect(styleCard.getByTestId('content-analysis')).toContainText('Ocean sunset')
    await expect(styleCard.getByTestId('style-dna')).toContainText('5 dimensions')
    for (const dimension of ['color', 'composition', 'lighting', 'texture', 'mood']) {
      await expect(styleCard.getByTestId(`evidence-facet-${dimension}`)).toBeVisible()
    }

    // Verify prompt editor is shown
    const promptCard = promptColumn(page).getByTestId('prompt-card')
    await expect(promptCard.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(promptCard.getByLabel('Full Generation Prompt')).not.toBeEmpty()
  })

  test('Confirm Prompt 后生成图片', async ({ page }) => {
    const genTaskId = 'happy-generation-task'
    // plan-07（实现规格 §4）：成功内联进入方向 rail——stateful feed 提供锚点
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })
    await mockGenerationCreate(page, genTaskId)
    await mockGenerationPolling(page, genTaskId, loadFixture('generation-completed.json'))

    // Upload and wait for analysis
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'happy-generation-analysis-task' })

    // Click generate（现行入口：Render Dock 的 Generate 按钮）
    const generateBtn = generateButton(page)
    await expect(generateBtn).toBeEnabled()
    await generateBtn.click()

    // 生成结果内联进入本次结果区（渲染真实图片），不打开阻断式弹层
    feed.set({
      completed: [railItem(genTaskId)],
      active: null,
      latestFailure: null,
    })
    const completedItem = page.locator(
      `[data-testid="direction-completed-item"][data-iteration-id="${genTaskId}"]`,
    )
    await expect(completedItem).toBeVisible({ timeout: 15000 })
    await expect(completedItem.locator('img')).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
  })

  test('对比Reference和结果图', async ({ page }) => {
    const genTaskId = 'happy-compare-generation-task'
    const feed = await mockDirectionFeedStateful(page, {
      completed: [],
      active: null,
      latestFailure: null,
    })
    await mockGenerationCreate(page, genTaskId)
    await mockGenerationPolling(page, genTaskId, loadFixture('generation-completed.json'))

    // Full flow
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'happy-compare-analysis-task' })
    await generateButton(page).click()

    // 结果图内联进入本次结果区（plan-07：真实图片缩略图，无弹层关闭步骤）
    feed.set({
      completed: [railItem(genTaskId)],
      active: null,
      latestFailure: null,
    })
    const completedItem = page.locator(
      `[data-testid="direction-completed-item"][data-iteration-id="${genTaskId}"]`,
    )
    await expect(completedItem).toBeVisible({ timeout: 15000 })
    await expect(completedItem.locator('img')).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    // 三栏布局下 Reference 与配方同屏保留，结果与参考可直接比较
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(referenceColumn(page).getByTestId('reference-card').getByAltText('Reference')).toBeVisible()
    await expect(styleColumn(page).getByTestId('recipe-card')).toContainText('Ocean sunset')
    await expect(promptColumn(page).getByTestId('prompt-card').getByTestId('unified-prompt-editor')).toBeVisible()
  })

  test('修改 Prompt 后迭代生成', async ({ page }) => {
    // 两次 POST /api/generation 依次返回不同 taskId，并捕获请求体中的 prompt
    let generationPostCount = 0
    let capturedPrompt = ''
    await page.route('**/api/generation', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      generationPostCount += 1
      const taskId = generationPostCount === 1 ? 'happy-iteration-task-1' : 'happy-iteration-task-2'
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
    await mockGenerationPolling(page, 'happy-iteration-task-1', {
      ...loadFixture('generation-completed.json'),
      id: 'happy-iteration-task-1',
    })
    await mockGenerationPolling(page, 'happy-iteration-task-2', {
      ...loadFixture('generation-completed.json'),
      id: 'happy-iteration-task-2',
    })

    // Complete first generation
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'happy-iteration-analysis-task' })
    await generateButton(page).click()
    feed.set({
      completed: [railItem('happy-iteration-task-1')],
      active: null,
      latestFailure: null,
    })
    await expect(
      page.locator(
        '[data-testid="direction-completed-item"][data-iteration-id="happy-iteration-task-1"]',
      ),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)

    // 修改 Prompt 后迭代生成：Generate 仍可用，第二次请求携带修改后的 prompt
    await page.getByLabel('Full Generation Prompt').fill('A vibrant sunrise over the mountains with mist')
    const generateBtn = generateButton(page)
    await expect(generateBtn).toBeVisible()
    await expect(generateBtn).toBeEnabled()
    await generateBtn.click()

    feed.set({
      completed: [
        railItem('happy-iteration-task-2'),
        railItem('happy-iteration-task-1'),
      ],
      active: null,
      latestFailure: null,
    })
    await expect(
      page.locator(
        '[data-testid="direction-completed-item"][data-iteration-id="happy-iteration-task-2"]',
      ),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
    expect(generationPostCount).toBe(2)
    expect(capturedPrompt).toBe('A vibrant sunrise over the mountains with mist')
  })
})
