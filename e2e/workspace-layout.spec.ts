import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import {
  mockUploadPresign,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockGenerationCreate,
  mockGenerationPolling,
  mockApiError,
  loadFixture,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

test.describe('Workspace Layout & State Flow', () => {
  // US-01: Empty state entry
  test('US-01 空态进入：两栏布局 + 状态栏 + UploadZone + 空态预览', async ({ page }) => {
    await page.goto('/workspace')

    // Verify two-column grid layout renders
    const gridContainer = page.locator('.grid.grid-cols-\\[1fr_380px\\]')
    await expect(gridContainer).toBeVisible()

    // Verify StatusBar shows "未开始" label
    await expect(page.getByText('未开始')).toBeVisible()

    // Verify canvas shows UploadZone
    await expect(page.getByText('点击或拖拽上传参考图')).toBeVisible()

    // Verify panel shows empty state preview ("创作流程")
    await expect(page.getByText('创作流程')).toBeVisible()
    await expect(page.getByText('AI 分析风格', { exact: true })).toBeVisible()
    await expect(page.getByText('编辑生成指令', { exact: true })).toBeVisible()
    await expect(page.getByText('设置参数生成', { exact: true })).toBeVisible()
  })

  // US-02: Upload and analyze
  test('US-02 上传并分析：画布切换 + StatusBar + 摘要 + Prompt 编辑 + 生成按钮', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)

    // Use a processing response first, then switch to completed
    // to observe "分析中" state before it transitions
    let pollCount = 0
    await page.route(`**/api/analysis/${taskId}`, async (route) => {
      pollCount++
      if (pollCount <= 2) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: taskId,
            status: 'processing',
            recipe: null,
            promptText: null,
            negativePromptText: null,
            errorMessage: null,
            errorStage: null,
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(analysisCompleted),
        })
      }
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Verify StatusBar changes to "分析中" (with processing polls, we can catch it)
    await expect(page.getByText('AI 正在分析图片风格...')).toBeVisible({ timeout: 15000 })

    // Wait for analysis to complete
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })

    // Verify Step 1 shows 5-field summary
    await expect(page.getByText('Step 1')).toBeVisible()
    await expect(page.getByText('主体')).toBeVisible()
    await expect(page.getByText('场景')).toBeVisible()
    await expect(page.getByText('光线')).toBeVisible()
    await expect(page.getByText('色彩')).toBeVisible()
    await expect(page.getByText('情绪')).toBeVisible()

    // Verify Step 2 Prompt editor is available
    await expect(page.getByText('Step 2')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Prompt 编辑' })).toBeVisible()

    // Verify Step 3 "生成首版" button is available
    await expect(page.getByRole('button', { name: '生成首版' })).toBeEnabled()
  })

  // US-03: Expand/collapse full recipe
  test('US-03 展开/收起完整配方', async ({ page }) => {
    const taskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, taskId)
    await mockAnalysisPolling(page, taskId, analysisCompleted)

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Wait for analysis to complete
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })

    // Click "展开完整配方"
    const expandBtn = page.getByRole('button', { name: '展开完整配方' })
    await expect(expandBtn).toBeVisible()
    await expandBtn.click()

    // Verify full recipe fields appear (composition, camera language etc)
    await expect(page.getByText('构图与镜头')).toBeVisible()
    await expect(page.getByText('质感与风格')).toBeVisible()
    await expect(page.getByText('关键词')).toBeVisible()

    // Click "收起完整配方"
    const collapseBtn = page.getByRole('button', { name: '收起完整配方' })
    await expect(collapseBtn).toBeVisible()
    await collapseBtn.click()

    // Verify back to summary view (detail sections hidden via grid-rows-[0fr])
    await expect(page.getByRole('button', { name: '展开完整配方' })).toBeVisible()
  })

  // US-04: Generate image
  test('US-04 生成图片：StatusBar + 结果图 + ComparisonView + 按钮变化', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const genTaskId = 'mock-generation-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')
    const generationCompleted = loadFixture('generation-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)
    await mockGenerationCreate(page, genTaskId)

    // Use polling sequence: first return processing, then completed
    // This allows us to observe the "生成中" state
    let genPollCount = 0
    await page.route(`**/api/generation/${genTaskId}`, async (route) => {
      genPollCount++
      if (genPollCount <= 2) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: genTaskId,
            status: 'processing',
            analysisTaskId,
            promptSnapshot: 'test',
            negativePromptSnapshot: '',
            params: { aspectRatio: '1:1', quality: 'standard' },
            modelName: 'flux.2',
            resultAssetId: null,
            resultFileUrl: null,
            errorMessage: null,
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(generationCompleted),
        })
      }
    })

    // Mock CDN image for result
    await page.route('https://cdn.example.com/**', async (route) => {
      if (route.request().resourceType() === 'image' || route.request().url().match(/\.(png|jpg|webp)$/)) {
        const pixel = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'
        )
        await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      } else {
        await route.continue()
      }
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })

    // Click "生成首版"
    await page.getByRole('button', { name: '生成首版' }).click()

    // Verify generation progress is shown (polling returns processing first)
    await expect(page.getByText('正在生成图片...')).toBeVisible({ timeout: 10000 })

    // Wait for generation to complete
    await expect(page.getByText('已完成')).toBeVisible({ timeout: 15000 })

    // Verify result display appears
    await expect(page.locator('h3').filter({ hasText: /^生成结果$/ })).toBeVisible()

    // Verify comparison view appears
    await expect(page.getByText('参考图 vs 生成结果')).toBeVisible()

    // Verify Step 3 button changes to "重新生成"
    await expect(page.getByRole('button', { name: '重新生成' })).toBeVisible()

    // Verify Step 2 title changes to "继续调整指令"
    await expect(page.getByText('继续调整指令')).toBeVisible()
  })

  // US-05: Comparison view (corresponds to PRD US-07)
  test('US-05 对比查看：参考图 vs 生成结果', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const genTaskId = 'mock-generation-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')
    const generationCompleted = loadFixture('generation-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)
    await mockGenerationCreate(page, genTaskId)
    await mockGenerationPolling(page, genTaskId, generationCompleted)

    await page.route('https://cdn.example.com/**', async (route) => {
      if (route.request().resourceType() === 'image' || route.request().url().match(/\.(png|jpg|webp)$/)) {
        const pixel = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'
        )
        await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      } else {
        await route.continue()
      }
    })

    // Complete full flow
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: '生成首版' }).click()
    await expect(page.getByText('已完成')).toBeVisible({ timeout: 15000 })

    // Verify comparison view is shown with both images
    await expect(page.getByText('参考图 vs 生成结果')).toBeVisible()
    // Verify both labels exist in comparison view
    const comparisonSection = page.locator('div').filter({ hasText: '参考图 vs 生成结果' }).first()
    await expect(comparisonSection).toBeVisible()
  })

  // US-06: Iterative re-generation (corresponds to PRD US-08)
  test('US-06 迭代重新生成：修改 Prompt 后重新生成', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const genTaskId1 = 'mock-generation-task-id-1'
    const genTaskId2 = 'mock-generation-task-id-2'
    const analysisCompleted = loadFixture('analysis-completed.json')

    const generationCompleted1 = {
      id: genTaskId1,
      analysisTaskId,
      status: 'completed' as const,
      promptSnapshot: 'A breathtaking sunset over the calm ocean',
      negativePromptSnapshot: 'blurry, low quality',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'flux.2',
      resultAssetId: 'mock-result-asset-id-1',
      resultFileUrl: 'https://cdn.example.com/generated/mock-gen-1/result.webp',
      errorMessage: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:05.000Z',
    }

    const generationCompleted2 = {
      id: genTaskId2,
      analysisTaskId,
      status: 'completed' as const,
      promptSnapshot: 'A vibrant sunrise over the mountains with mist',
      negativePromptSnapshot: 'blurry, low quality',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'flux.2',
      resultAssetId: 'mock-result-asset-id-2',
      resultFileUrl: 'https://cdn.example.com/generated/mock-gen-2/result.webp',
      errorMessage: null,
      createdAt: '2024-01-01T00:00:10.000Z',
      updatedAt: '2024-01-01T00:00:15.000Z',
    }

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)

    // First generation
    await mockGenerationCreate(page, genTaskId1)
    await mockGenerationPolling(page, genTaskId1, generationCompleted1)

    await page.route('https://cdn.example.com/**', async (route) => {
      if (route.request().resourceType() === 'image' || route.request().url().match(/\.(png|jpg|webp)$/)) {
        const pixel = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'
        )
        await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      } else {
        await route.continue()
      }
    })

    // Complete first generation
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: '生成首版' }).click()
    await expect(page.getByText('已完成')).toBeVisible({ timeout: 15000 })

    // Modify prompt text
    const promptTextarea = page.locator('#prompt-text')
    await promptTextarea.fill('A vibrant sunrise over the mountains with mist')

    // Track generation POST to verify modified prompt is sent
    let capturedPrompt = ''
    await page.route('**/api/generation', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { promptText?: string }
        capturedPrompt = body.promptText ?? ''
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: genTaskId2, status: 'pending' }),
        })
      } else {
        await route.continue()
      }
    })

    // Set up polling for second generation
    await page.route(`**/api/generation/${genTaskId2}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(generationCompleted2),
      })
    })

    // Click "重新生成"
    await page.getByRole('button', { name: '重新生成' }).click()

    // Verify the modified prompt was sent
    await expect(page.getByText('已完成')).toBeVisible({ timeout: 15000 })
    expect(capturedPrompt).toBe('A vibrant sunrise over the mountains with mist')
  })

  // US-07: Replace reference image
  test('US-07 更换参考图：所有状态重置', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const genTaskId = 'mock-generation-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')
    const generationCompleted = loadFixture('generation-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)
    await mockGenerationCreate(page, genTaskId)
    await mockGenerationPolling(page, genTaskId, generationCompleted)

    await page.route('https://cdn.example.com/**', async (route) => {
      if (route.request().resourceType() === 'image' || route.request().url().match(/\.(png|jpg|webp)$/)) {
        const pixel = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'
        )
        await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      } else {
        await route.continue()
      }
    })

    // Complete full flow
    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: '生成首版' }).click()
    await expect(page.getByText('已完成')).toBeVisible({ timeout: 15000 })

    // Click "更换参考图" in StatusBar
    const replaceBtn = page.getByRole('button', { name: '更换参考图' })
    await expect(replaceBtn).toBeVisible()
    await replaceBtn.click()

    // Verify all state resets
    await expect(page.getByText('点击或拖拽上传参考图')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('未开始')).toBeVisible()
    await expect(page.getByText('创作流程')).toBeVisible()

    // Recipe and result should be gone
    await expect(page.getByText('Step 1')).not.toBeVisible()
    await expect(page.locator('h3').filter({ hasText: /^生成结果$/ })).not.toBeVisible()
  })

  // US-08: Error handling and recovery (corresponds to PRD US-09)
  test('US-08a 分析失败场景：ErrorDisplay + 重试和更换参考图', async ({ page }) => {
    await mockUploadPresign(page)

    // Mock CDN image for retry
    await page.route('https://cdn.example.com/**', async (route) => {
      if (route.request().resourceType() === 'image' || route.request().url().match(/\.(png|jpg|webp)$/)) {
        const pixel = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'
        )
        await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      } else {
        await route.continue()
      }
    })

    // First analysis call fails with VISION_FAILED (which shows both retry and replace)
    const taskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')
    let analysisCallCount = 0

    await page.route('**/api/analysis', async (route) => {
      if (route.request().method() === 'POST') {
        analysisCallCount++
        if (analysisCallCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: '视觉分析失败',
              code: 'VISION_FAILED',
              retryable: true,
            }),
          })
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: taskId, status: 'pending' }),
          })
        }
      } else {
        await route.continue()
      }
    })

    await mockAnalysisPolling(page, taskId, analysisCompleted)

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)

    // Verify ErrorDisplay appears in RecipeStep area
    await expect(page.getByText('视觉分析失败').first()).toBeVisible({ timeout: 15000 })

    // Verify both "重试" and "更换参考图" buttons are available
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('button', { name: '更换参考图' })).toBeVisible()

    // Click retry
    await page.getByRole('button', { name: '重试' }).click()

    // Verify error clears and flow resumes
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })
  })

  test('US-08b 生成失败场景：ErrorDisplay + Prompt 保留', async ({ page }) => {
    const analysisTaskId = 'mock-analysis-task-id'
    const analysisCompleted = loadFixture('analysis-completed.json')

    await mockUploadPresign(page)
    await mockAnalysisCreate(page, analysisTaskId)
    await mockAnalysisPolling(page, analysisTaskId, analysisCompleted)

    // Mock generation POST fails
    await mockApiError(page, '**/api/generation', 500, {
      error: '服务暂时不可用',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await page.goto('/workspace')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(TEST_IMAGE_PATH)
    await expect(page.getByText('可生成')).toBeVisible({ timeout: 15000 })

    // Click generate
    await page.getByRole('button', { name: '生成首版' }).click()

    // Verify ErrorDisplay appears in OutputSettings area
    await expect(page.getByText('服务暂时不可用').first()).toBeVisible({ timeout: 15000 })

    // Verify Prompt and parameters are preserved
    await expect(page.getByRole('heading', { name: 'Prompt 编辑' })).toBeVisible()
    const promptTextarea = page.locator('#prompt-text')
    await expect(promptTextarea).not.toBeEmpty()
    await expect(promptTextarea).not.toBeDisabled()
  })
})
