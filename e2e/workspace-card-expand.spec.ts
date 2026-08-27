import { expect, test, type Page } from '@playwright/test'
import { mockAuthSession, mockGenerationList } from './helpers/mock-api'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function mockCdnImages(page: Page) {
  await page.route('https://cdn.example.com/**', async (route) => {
    if (
      route.request().resourceType() === 'image' ||
      /\.(png|jpg|jpeg|webp)$/.test(route.request().url())
    ) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      return
    }
    await route.continue()
  })
}

test.describe('workspace card expansion', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
    // History strip（底部 Recent iterations）挂载即 GET 生成列表
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('enlarges Style Intelligence and Prompt editor without losing workspace state', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'workspace-card-expand-analysis-task',
    })

    await page.getByRole('button', { name: 'Expand Style Intelligence' }).click()

    const styleDialog = page.getByRole('dialog', { name: 'Style Intelligence' })
    await expect(styleDialog).toBeVisible()
    const styleBox = await styleDialog.boundingBox()
    expect(styleBox).not.toBeNull()
    expect(styleBox!.x).toBeGreaterThanOrEqual(16)
    expect(styleBox!.y).toBeGreaterThanOrEqual(16)
    expect(styleBox!.width).toBeLessThanOrEqual(1366 - 32)
    expect(styleBox!.height).toBeLessThanOrEqual(900 - 32)

    // 图像摘要位于 Content 折叠区内，现行需先展开 Content 再断言不被裁切
    await styleDialog.getByTestId('content-analysis').click()
    const summaryIsUnclipped = await styleDialog
      .getByTestId('style-intelligence-image-summary')
      .evaluate((element) => element.scrollHeight <= element.clientHeight)
    expect(summaryIsUnclipped).toBe(true)

    await styleDialog.getByTestId('evidence-facet-lighting').click()
    await expect(styleDialog.getByTestId('evidence-facet-lighting')).toHaveAttribute(
      'data-selected',
      'true',
    )
    await styleDialog
      .getByRole('button', { name: 'Close expanded Style Intelligence' })
      .click()
    await expect(styleDialog).toHaveCount(0)

    const promptInput = page.getByLabel('Full Generation Prompt')
    await promptInput.fill('Expanded prompt draft')
    await page.getByRole('button', { name: 'Expand Prompt editor' }).click()

    const promptDialog = page.getByRole('dialog', { name: 'Prompt + Render' })
    await expect(promptDialog).toBeVisible()
    await expect(promptDialog.getByTestId('unified-prompt-editor')).toHaveAttribute(
      'data-compact',
      'false',
    )
    await expect(promptDialog.getByLabel('Full Generation Prompt')).toHaveValue(
      'Expanded prompt draft',
    )
    await expect(promptDialog.getByTestId('output-card')).toHaveCount(0)

    await promptDialog.getByRole('button', { name: 'Save as Style Memory' }).click()
    // plan-06：保存入口打开三步向导（ModalDialog，Close 仍可关闭并还原焦点）
    const saveDialog = page.getByTestId('save-style-memory-dialog')
    await expect(saveDialog).toBeVisible()
    await saveDialog.getByRole('button', { name: 'Close' }).click()
    await expect(saveDialog).toHaveCount(0)
    await expect(promptDialog).toBeVisible()

    const promptBox = await promptDialog.boundingBox()
    expect(promptBox).not.toBeNull()
    expect(promptBox!.x).toBeGreaterThanOrEqual(16)
    expect(promptBox!.y).toBeGreaterThanOrEqual(16)
    expect(promptBox!.width).toBeLessThanOrEqual(1366 - 32)
    expect(promptBox!.height).toBeLessThanOrEqual(900 - 32)

    // 保存弹窗关闭后焦点回到 body；Escape 由面板内 keydown 捕获，
    // 先聚焦面板内编辑器再按 Escape（真实用户收起路径）
    await promptDialog.getByLabel('Full Generation Prompt').click()
    await page.keyboard.press('Escape')
    await expect(promptDialog).toHaveCount(0)
    await expect(page.getByTestId('output-card')).toBeVisible()
    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue(
      'Expanded prompt draft',
    )
  })
})
