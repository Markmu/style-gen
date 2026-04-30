import { expect, test } from '@playwright/test'
import { gotoWorkspace, uploadAndCompleteAnalysis, uploadAndStartAnalysis } from './helpers/workspace-actions'

test.describe('workspace 09 two pane layout', () => {
  test('keeps analysis and editing panes visible in the empty state', async ({ page }) => {
    await gotoWorkspace(page)

    await expect(page.getByTestId('workspace-two-pane-layout')).toBeVisible()
    await expect(page.getByTestId('analysis-pane')).toBeVisible()
    await expect(page.getByTestId('reference-preview')).toBeVisible()
    await expect(page.getByTestId('style-breakdown-panel')).toBeVisible()
    await expect(page.getByTestId('editing-pane')).toBeVisible()
  })

  test('keeps the same left and right responsibilities while analyzing', async ({ page }) => {
    await uploadAndStartAnalysis(page, { analysisTaskId: 'two-pane-analysis-task' })

    await expect(page.getByTestId('workspace-two-pane-layout')).toBeVisible()
    await expect(page.getByTestId('reference-preview')).toContainText('参考图')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText(/分析|排队/)
    await expect(page.getByTestId('editing-pane')).toBeVisible()
  })

  test('keeps reference preview compact and style breakdown primary after analysis', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'two-pane-completed-task' })

    const referenceBox = await page.getByTestId('reference-preview').boundingBox()
    const breakdownBox = await page.getByTestId('style-breakdown-panel').boundingBox()

    expect(referenceBox?.height ?? 0).toBeLessThan(breakdownBox?.height ?? 0)
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('风格拆解')
    await expect(page.getByTestId('editing-pane')).toBeVisible()
  })

  for (const width of [1280, 1440]) {
    test(`uses the stable two pane shell at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await uploadAndCompleteAnalysis(page, { analysisTaskId: `two-pane-${width}-task` })

      const paneCount = await page.locator('[data-testid="workspace-primary-column"]').count()
      expect(paneCount).toBe(2)
      await expect(page.getByTestId('workspace-two-pane-layout')).toBeVisible()
    })
  }
})
