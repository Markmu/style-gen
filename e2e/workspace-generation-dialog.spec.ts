import { expect, test } from '@playwright/test'
import { mockGenerationCreate, mockGenerationPolling, mockGenerationPollingSequence, loadFixture } from './helpers/mock-api'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

test.describe('workspace 09 generation dialog', () => {
  test('opens a dialog for generation progress and sends an empty negative prompt', async ({ page }) => {
    let requestBody: Record<string, unknown> | null = null

    await mockGenerationCreate(page, 'dialog-progress-task')
    await page.route('**/api/generation', async (route) => {
      if (route.request().method() === 'POST') {
        requestBody = route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'dialog-progress-task', status: 'pending' }),
        })
      } else {
        await route.continue()
      }
    })
    await mockGenerationPolling(page, 'dialog-progress-task', {
      id: 'dialog-progress-task',
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'dialog-progress-analysis-task' })

    await expect(page.getByLabel(/Negative Prompt/i)).toHaveCount(0)
    await page.getByRole('button', { name: '生成图片' }).click()

    await expect(page.getByRole('dialog', { name: '生成任务' })).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toContainText(/生成|排队/)
    expect(requestBody && requestBody['negativePromptText']).toBe('')
  })

  test('shows completed result in the dialog and keeps context after close', async ({ page }) => {
    await mockGenerationCreate(page, 'dialog-completed-task')
    await mockGenerationPollingSequence(page, 'dialog-completed-task', [
      { id: 'dialog-completed-task', status: 'processing', resultFileUrl: null, errorMessage: null },
      { ...loadFixture('generation-completed.json'), id: 'dialog-completed-task' },
    ])

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'dialog-completed-analysis-task' })
    await page.getByRole('button', { name: '生成图片' }).click()

    await expect(page.getByRole('dialog', { name: '生成任务' })).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toContainText('生成结果')
    await page.getByText('关闭弹窗', { exact: true }).click()

    await expect(page.getByTestId('workspace-two-pane-layout')).toBeVisible()
    await expect(page.getByTestId('reference-preview')).toContainText('Image')
    await expect(page.getByTestId('style-breakdown-panel')).toContainText('Subject')
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
  })

  test('shows generation failure in the dialog and returns to editing without clearing context', async ({ page }) => {
    await mockGenerationCreate(page, 'dialog-failed-task')
    await mockGenerationPolling(page, 'dialog-failed-task', {
      id: 'dialog-failed-task',
      status: 'failed',
      resultFileUrl: null,
      errorMessage: '生成服务暂时不可用',
    })

    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'dialog-failed-analysis-task' })
    await page.getByRole('button', { name: '生成图片' }).click()

    await expect(page.getByRole('dialog', { name: '生成任务' })).toBeVisible()
    await expect(page.getByTestId('generation-dialog')).toContainText('生成失败')
    await page.getByRole('button', { name: '返回编辑' }).click()

    await expect(page.getByRole('dialog', { name: '生成任务' })).toHaveCount(0)
    await expect(page.getByTestId('reference-preview')).toContainText('Image')
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
  })
})
