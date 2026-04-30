import { expect, test } from '@playwright/test'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

test.describe('workspace 09 unified editor', () => {
  test('shows one editor with template and text modes after analysis', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'unified-editor-analysis-task' })

    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(page.getByRole('button', { name: '模板模式' })).toBeVisible()
    await expect(page.getByRole('button', { name: '文本模式' })).toBeVisible()

    await page.getByRole('button', { name: '文本模式' }).click()
    await expect(page.getByLabel('完整生成提示')).toHaveValue(/sunset|ocean|golden/i)
  })

  test('keeps template variables outside the template body and renders them into text mode', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'unified-editor-variable-task' })

    await page.getByRole('button', { name: '模板模式' }).click()
    await page.getByLabel('模板原文').fill('Create a {{subject}} in {{lighting}}.')
    await page.getByLabel('变量 subject').fill('glass sculpture')
    await page.getByLabel('变量 lighting').fill('soft morning light')

    await expect(page.getByTestId('template-variable-panel')).toBeVisible()
    await page.getByRole('button', { name: '文本模式' }).click()

    await expect(page.getByLabel('完整生成提示')).toHaveValue('Create a glass sculpture in soft morning light.')
  })

  test('preserves template, variable and text drafts across mode switches', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'unified-editor-draft-task' })

    await page.getByRole('button', { name: '模板模式' }).click()
    await page.getByLabel('模板原文').fill('Render {{subject}} with editorial precision.')
    await page.getByLabel('变量 subject').fill('a porcelain chair')
    await page.getByRole('button', { name: '文本模式' }).click()
    await page.getByLabel('完整生成提示').fill('Manual prompt draft')
    await page.getByRole('button', { name: '模板模式' }).click()

    await expect(page.getByLabel('模板原文')).toHaveValue('Render {{subject}} with editorial precision.')
    await expect(page.getByLabel('变量 subject')).toHaveValue('a porcelain chair')

    await page.getByRole('button', { name: '文本模式' }).click()
    await expect(page.getByLabel('完整生成提示')).toHaveValue('Manual prompt draft')
  })
})
