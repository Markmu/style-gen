import { expect, test } from '@playwright/test'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

test.describe('workspace card expansion', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

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
    const saveDialog = page.getByRole('dialog', { name: 'Save as Template' })
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

    await page.keyboard.press('Escape')
    await expect(promptDialog).toHaveCount(0)
    await expect(page.getByTestId('output-card')).toBeVisible()
    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue(
      'Expanded prompt draft',
    )
  })
})
