import { expect, test } from '@playwright/test'
import {
  gotoWorkspace,
  uploadAndCompleteAnalysis,
  uploadAndStartAnalysis,
} from './helpers/workspace-actions'

function legacyWorkspaceLayoutTestId() {
  return ['workspace', 'two', 'pane', 'layout'].join('-')
}

test.describe('workspace 09 layout compatibility after Phase 12', () => {
  test('keeps the AI-first three-column workbench visible in the empty state', async ({ page }) => {
    await gotoWorkspace(page)

    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(page.getByTestId('reference-card')).toBeVisible()
    await expect(page.getByTestId('recipe-card')).toBeVisible()
    await expect(page.getByTestId('prompt-card')).toBeVisible()
    await expect(page.getByTestId('output-card')).toBeVisible()
    await expect(page.getByTestId(legacyWorkspaceLayoutTestId())).toHaveCount(0)
  })

  test('keeps Reference, Evidence, and Prompt responsibilities visible while analyzing', async ({
    page,
  }) => {
    await uploadAndStartAnalysis(page, { analysisTaskId: 'layout-compat-analysis-task' })

    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(page.getByTestId('reference-card')).toContainText(/Image|Reference|reading/i)
    await expect(page.getByTestId('recipe-card')).toContainText(/Style Intelligence|Analyze|Evidence/i)
    await expect(page.getByTestId('prompt-card')).toBeVisible()
    await expect(page.getByTestId(legacyWorkspaceLayoutTestId())).toHaveCount(0)
  })

  test('keeps analysis-ready evidence and Render Dock inside the Phase 12 shell', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, { analysisTaskId: 'layout-compat-completed-task' })

    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
    await expect(page.getByTestId('recipe-card')).toContainText(/Subject|Evidence|Style/i)
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(page.getByTestId('output-card')).toBeVisible()
    await expect(page.getByTestId(legacyWorkspaceLayoutTestId())).toHaveCount(0)
  })

  for (const width of [1280, 1440]) {
    test(`uses the stable AI-first shell at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await uploadAndCompleteAnalysis(page, { analysisTaskId: `layout-compat-${width}-task` })

      await expect(page.getByTestId('workspace-reference-column')).toBeVisible()
      await expect(page.getByTestId('workspace-style-intelligence-column')).toBeVisible()
      await expect(page.getByTestId('workspace-prompt-render-column')).toBeVisible()
      await expect(page.getByTestId(legacyWorkspaceLayoutTestId())).toHaveCount(0)
    })
  }
})
