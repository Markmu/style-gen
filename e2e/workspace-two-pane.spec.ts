import { expect, test } from '@playwright/test'
import { gotoWorkspace, uploadAndCompleteAnalysis, uploadAndStartAnalysis } from './helpers/workspace-actions'

test.describe('workspace 09 two pane layout', () => {
  test('keeps the unified analysis card and editing pane visible in the empty state', async ({ page }) => {
    await gotoWorkspace(page)

    await expect(page.getByTestId('workspace-two-pane-layout')).toBeVisible()
    await expect(page.getByTestId('analysis-pane')).toBeVisible()
    await expect(page.getByTestId('analysis-pane')).toHaveClass(/surface-panel/)
    await expect(page.getByTestId('reference-preview')).toBeVisible()
    await expect(page.getByTestId('reference-preview')).not.toHaveClass(/surface-panel/)
    await expect(page.getByTestId('style-breakdown-panel')).toBeVisible()
    await expect(page.getByTestId('style-breakdown-panel')).not.toHaveClass(/surface-panel/)
    await expect(page.getByTestId('editing-pane')).toBeVisible()

    const cardBox = await page.getByTestId('analysis-pane').boundingBox()
    const referenceBox = await page.getByTestId('reference-preview').boundingBox()
    expect(cardBox).not.toBeNull()
    expect(referenceBox).not.toBeNull()
    if (cardBox && referenceBox) {
      const referenceRatio = referenceBox.height / cardBox.height
      expect(referenceRatio).toBeGreaterThan(0.27)
      expect(referenceRatio).toBeLessThan(0.38)
    }
  })

  test('keeps reference and analysis responsibilities inside one card while analyzing', async ({ page }) => {
    await uploadAndStartAnalysis(page, { analysisTaskId: 'two-pane-analysis-task' })

    await expect(page.getByTestId('workspace-two-pane-layout')).toBeVisible()
    await expect(page.getByTestId('reference-preview')).toContainText('Image')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText(/Analyze|Analyzing|queued/)
    await expect(page.getByTestId('editing-pane')).toBeVisible()
  })

  test('keeps compact reference preview and style breakdown inside the unified card after analysis', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'two-pane-completed-task' })

    const cardBox = await page.getByTestId('analysis-pane').boundingBox()
    const referenceBox = await page.getByTestId('reference-preview').boundingBox()
    const breakdownBox = await page.getByTestId('style-breakdown-panel').boundingBox()

    expect(cardBox).not.toBeNull()
    expect(referenceBox).not.toBeNull()
    expect(breakdownBox).not.toBeNull()
    if (cardBox && referenceBox && breakdownBox) {
      expect(referenceBox.y).toBeGreaterThanOrEqual(cardBox.y)
      expect(breakdownBox.y + breakdownBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1)
      const referenceRatio = referenceBox.height / cardBox.height
      expect(referenceRatio).toBeGreaterThan(0.27)
      expect(referenceRatio).toBeLessThan(0.38)
    }
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Subject')
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
