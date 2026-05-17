import { expect, test } from '@playwright/test'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

test.describe('workspace 09 unified editor', () => {
  test('shows one editor with template and text modes after analysis', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'unified-editor-analysis-task' })

    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Template Mode' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Text Mode' })).toBeVisible()

    await page.getByRole('button', { name: 'Text Mode' }).click()
    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue(/sunset|ocean|golden/i)
  })

  test('keeps template variables outside the template body and renders them into text mode', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'unified-editor-variable-task' })

    await page.getByRole('button', { name: 'Template Mode' }).click()
    await page.getByLabel('Template Source').fill('Create a {{subject}} in {{lighting}}.')
    await page.getByLabel('Variable subject').fill('glass sculpture')
    await page.getByLabel('Variable lighting').fill('soft morning light')

    await expect(page.getByTestId('template-variable-panel')).toBeVisible()
    await page.getByRole('button', { name: 'Text Mode' }).click()

    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue('Create a glass sculpture in soft morning light.')
  })

  test('preserves template, variable and text drafts across mode switches', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'unified-editor-draft-task' })

    await page.getByRole('button', { name: 'Template Mode' }).click()
    await page.getByLabel('Template Source').fill('Render {{subject}} with editorial precision.')
    await page.getByLabel('Variable subject').fill('a porcelain chair')
    await page.getByRole('button', { name: 'Text Mode' }).click()
    await page.getByLabel('Full Generation Prompt').fill('Manual prompt draft')
    await page.getByRole('button', { name: 'Template Mode' }).click()

    await expect(page.getByLabel('Template Source')).toHaveValue('Render {{subject}} with editorial precision.')
    await expect(page.getByLabel('Variable subject')).toHaveValue('a porcelain chair')

    await page.getByRole('button', { name: 'Text Mode' }).click()
    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue('Manual prompt draft')
  })
})
