import { expect, test, type Page } from '@playwright/test'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockAnalysisPollingSequence,
  mockAuthSession,
  mockGenerationList,
  mockUploadPresign,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'
import { gotoWorkspace, TEST_IMAGE_PATH } from './helpers/workspace-actions'

const STORAGE_KEY = 'style-gen-workspace-state'

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

/** 现行三栏区域：Reference Canvas / Style Intelligence / Prompt and Render */
function referenceColumn(page: Page) {
  return page.getByRole('region', { name: 'Reference Canvas column' })
}

function styleColumn(page: Page) {
  return page.getByRole('region', { name: 'Style Intelligence column' })
}

function promptColumn(page: Page) {
  return page.getByRole('region', { name: 'Prompt and Render column' })
}

function referenceCard(page: Page) {
  return referenceColumn(page).getByTestId('reference-card')
}

function recipeCard(page: Page) {
  return styleColumn(page).getByTestId('recipe-card')
}

function promptCard(page: Page) {
  return promptColumn(page).getByTestId('prompt-card')
}

async function uploadReference(page: Page) {
  const input = referenceColumn(page).locator('input[type="file"]')
  await waitForReactInput(input)
  await input.setInputFiles(TEST_IMAGE_PATH)
}

const processingAnalysisResponse = {
  status: 'processing',
  recipe: null,
  promptText: null,
  negativePromptText: null,
  errorMessage: null,
  errorStage: null,
}

test.describe('PLAN-01 three column workspace layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    // History strip（底部 Recent iterations）挂载即 GET 生成列表
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('TC-1.1 renders the empty workspace as a three column skeleton', async ({ page }) => {
    await gotoWorkspace(page)

    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(page.getByTestId('workspace-two-pane-layout')).toHaveCount(0)

    const reference = referenceCard(page)
    const recipe = recipeCard(page)
    const prompt = promptCard(page)
    await expect(reference).toBeVisible()
    await expect(recipe).toBeVisible()
    await expect(prompt).toBeVisible()
    await expect(reference).toContainText('Reference Canvas')
    await expect(recipe).toContainText('Style Intelligence')
    await expect(prompt).toContainText('Prompt + Render')

    // 旧「top-mode-switcher 停在 Analyze」的现行等价物：AI Copilot ribbon 处于
    // idle 阶段，Phase 指标为 Analyze 并指引用户上传参考图。
    const ribbon = page.getByTestId('ai-copilot-ribbon')
    await expect(ribbon).toBeVisible()
    await expect(ribbon).toHaveAttribute('data-phase', 'idle')
    await expect(ribbon).toContainText('Analyze')
    await expect(ribbon).toContainText('Upload a reference image')

    // 旧「Editing/Generate/Result 按钮禁用」的现行等价物：Prompt and Render 列的
    // Render Dock 生成入口在空态保持禁用。
    const dock = promptColumn(page).getByTestId('output-card')
    await expect(dock).toBeVisible()
    await expect(dock).toHaveAttribute('data-readiness-can-generate', 'false')
    await expect(dock.getByRole('button', { name: /^Generate$/i })).toBeDisabled()
  })

  test('TC-1.2 keeps the three cards mounted while upload and analysis are processing', async ({ page }) => {
    const taskId = 'three-column-processing-task'
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPollingSequence(page, taskId, [processingAnalysisResponse])

    await gotoWorkspace(page)
    await uploadReference(page)

    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible({ timeout: 15000 })
    await expect(referenceCard(page)).toBeVisible()
    await expect(recipeCard(page)).toBeVisible()
    await expect(promptCard(page)).toBeVisible()

    // 旧「处理中仍处于 Analyze 模式」的现行等价物：状态带处于 analyzing 阶段
    // （Phase 指标 Reading），布局不切换。
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analyzing', {
      timeout: 15000,
    })
    await expect(page.getByTestId('ai-copilot-ribbon')).toContainText('Reading')
  })

  test('TC-1.3 maps completed analysis to the Editing phase without changing the layout', async ({ page }) => {
    const taskId = 'three-column-completed-task'
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, loadFixture('analysis-completed.json'))

    await gotoWorkspace(page)
    await uploadReference(page)

    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible({ timeout: 15000 })
    await expect(referenceCard(page)).toBeVisible()
    await expect(recipeCard(page)).toBeVisible()
    await expect(promptCard(page)).toBeVisible()

    // 旧「完成分析映射 Editing 模式」的现行等价物：状态带进入 analysis_ready
    // 阶段，ribbon Phase 指标显示 Editing。
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'analysis_ready',
      { timeout: 15000 },
    )
    await expect(page.getByTestId('ai-copilot-ribbon')).toContainText('Editing')
    await expect(referenceCard(page).getByAltText('Reference')).toBeVisible()
  })

  test('TC-1.4 phase flow highlights Editing and keeps workspace data intact', async ({ page }) => {
    const taskId = 'three-column-manual-mode-task'
    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPollingSequence(page, taskId, [
      processingAnalysisResponse,
      loadFixture('analysis-completed.json'),
    ])

    await gotoWorkspace(page)
    await uploadReference(page)

    // 阶段流转：analyzing（Reading）→ analysis_ready（Editing）
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analyzing', {
      timeout: 15000,
    })
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute(
      'data-phase',
      'analysis_ready',
      { timeout: 15000 },
    )
    const ribbon = page.getByTestId('ai-copilot-ribbon')
    await expect(ribbon).toContainText('Editing')

    // 数据保持：参考图与风格拆解不因阶段切换而重置
    await expect(referenceCard(page).getByAltText('Reference')).toBeVisible()
    await expect(recipeCard(page)).toContainText('Ocean sunset')

    // 在 Editing 阶段编辑 prompt 后，阶段高亮与三栏数据均保持
    const editor = promptCard(page).getByLabel('Full Generation Prompt')
    await expect(editor).not.toBeEmpty()
    await editor.fill('Custom editing prompt kept across phase highlight')
    await expect(editor).toHaveValue('Custom editing prompt kept across phase highlight')
    await expect(ribbon).toContainText('Editing')
    await expect(referenceCard(page).getByAltText('Reference')).toBeVisible()
    await expect(recipeCard(page)).toContainText('Ocean sunset')
  })

  for (const width of [1280, 1440]) {
    test(`TC-1.5 keeps the column rhythm of the current grid at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await gotoWorkspace(page)

      const reference = referenceCard(page)
      const recipe = recipeCard(page)
      const prompt = promptCard(page)
      await expect(reference).toBeVisible({ timeout: 5000 })
      await expect(recipe).toBeVisible({ timeout: 5000 })
      await expect(prompt).toBeVisible({ timeout: 5000 })

      const referenceBox = await reference.boundingBox()
      const recipeBox = await recipe.boundingBox()
      const promptBox = await prompt.boundingBox()

      expect(referenceBox).not.toBeNull()
      expect(recipeBox).not.toBeNull()
      expect(promptBox).not.toBeNull()
      if (referenceBox && recipeBox && promptBox) {
        // 现行 grid（workspace-three-column-layout.tsx，plan-07 Task 4 收口）：
        // reference 为 clamp(17.5rem, aspect 驱动 dvh, 22rem)——下/上界改为绝对
        // rem（25vw/33.333vw 含侧栏，在 1280 视口会把三列最小宽度推过主区
        // 产生横向溢出，见 TC-7.9）；Style Intelligence 与 Prompt and Render
        // 为 0.86fr : 1.15fr，gap-3，列间邻接关系不变。
        const promptToRecipeRatio = promptBox.width / recipeBox.width
        expect(promptToRecipeRatio).toBeGreaterThan(1.26)
        expect(promptToRecipeRatio).toBeLessThan(1.42)

        expect(referenceBox.width).toBeGreaterThanOrEqual(280 - 1)
        expect(referenceBox.width).toBeLessThanOrEqual(352 + 1)

        expect(Math.abs(recipeBox.x - (referenceBox.x + referenceBox.width + 12))).toBeLessThanOrEqual(6)
        expect(Math.abs(promptBox.x - (recipeBox.x + recipeBox.width + 12))).toBeLessThanOrEqual(6)
      }
    })
  }

  test('TC-1.6 clears damaged sessionStorage and still renders idle three column state', async ({ page }) => {
    await page.addInitScript((storageKey) => {
      window.sessionStorage.setItem(storageKey, '{broken-json')
    }, STORAGE_KEY)

    await gotoWorkspace(page)

    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    const ribbon = page.getByTestId('ai-copilot-ribbon')
    await expect(ribbon).toHaveAttribute('data-phase', 'idle')
    await expect(ribbon).toContainText('Analyze')
    await expect(referenceCard(page)).toContainText(/Click or drag to upload a reference image/i)
    // 布局可见可能早于客户端 hydrate（SSR HTML 同样包含三栏骨架），用轮询等待
    // use-workspace-state 初始化：损坏快照被清除或被有效状态覆写。
    await expect
      .poll(
        () => page.evaluate((storageKey) => window.sessionStorage.getItem(storageKey), STORAGE_KEY),
        { timeout: 10000 },
      )
      .not.toBe('{broken-json')
  })
})
