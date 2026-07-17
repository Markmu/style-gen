import { expect, test } from '@playwright/test'
import { loadFixture, mockGenerationList, mockGenerationPolling } from './helpers/mock-api'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

const response = loadFixture('analysis-v2-completed.json')

function editor(page: import('@playwright/test').Page) {
  return page.getByTestId('structured-prompt-editor')
}

function generateButton(page: import('@playwright/test').Page) {
  return page.getByTestId('output-card').first().getByRole('button', { name: /^Generate$/i })
}

test.describe('FEAT-0004 structured style extraction', () => {
  test.beforeEach(async ({ page }) => {
    await mockGenerationList(page)
  })

  test('shows four scan areas, real textual evidence, and generates the edited Standard prompt', async ({ page }) => {
    let generationRequest: Record<string, unknown> = {}
    await page.route('**/api/generation', async (route) => {
      if (route.request().method() === 'POST') {
        generationRequest = route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'v2-generation-task', status: 'pending' }),
        })
        return
      }
      await route.continue()
    })
    await mockGenerationPolling(page, 'v2-generation-task', {
      id: 'v2-generation-task',
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-v2-flow',
      analysisResponse: response,
    })

    await expect(page.getByTestId('content-analysis')).toBeVisible()
    await expect(page.getByTestId('style-dna')).toBeVisible()
    await expect(page.getByTestId('style-invariants')).toBeVisible()
    await expect(page.getByTestId('prompt-outputs')).toBeVisible()
    await expect(page.getByText('Observed: Natural photographic highlights')).toBeVisible()
    await expect(page.getByText(/90% model confidence/i)).toBeVisible()
    await expect(page.locator('[data-testid^="reference-anchor-"]')).toHaveCount(0)

    await expect(editor(page).getByRole('tab', { name: 'Standard' })).toHaveAttribute('aria-selected', 'true')
    await editor(page).getByLabel('Subject').fill('red ceramic stool')
    await expect(editor(page)).toContainText('red ceramic stool')
    await generateButton(page).click()

    expect(generationRequest.promptText).toContain('red ceramic stool')
    expect(generationRequest.promptText).toContain('soft directional window light')
    expect(generationRequest.promptText).not.toContain('{{')
    expect(generationRequest.negativePromptText).toBe('watermark, distorted glass')
  })

  test('isolates custom text, disables Structured generation, restores session edits, and clears on Replace', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-v2-persistence',
      analysisResponse: response,
    })

    await editor(page).getByRole('button', { name: 'Edit as custom text' }).click()
    await editor(page).getByLabel('Custom prompt').fill('hand tuned persistent draft')
    await editor(page).getByRole('tab', { name: 'Concise' }).click()
    await editor(page).getByRole('tab', { name: 'Custom' }).click()
    await expect(editor(page).getByLabel('Custom prompt')).toHaveValue('hand tuned persistent draft')

    await editor(page).getByRole('tab', { name: 'Structured' }).click()
    await expect(generateButton(page)).toBeDisabled()
    await expect(editor(page)).toContainText(/cannot be sent to generation/i)
    await editor(page).getByRole('tab', { name: 'Custom' }).click()
    await page.waitForTimeout(400)
    await page.reload()

    await expect(editor(page)).toBeVisible({ timeout: 15000 })
    await expect(editor(page).getByLabel('Custom prompt')).toHaveValue('hand tuned persistent draft')
    await page.getByTestId('reference-card').getByRole('button', { name: 'Replace' }).click()
    await expect(editor(page)).toHaveCount(0)
    await expect(page.getByTestId('reference-upload-panel')).toBeVisible()
  })

  test('saves reusable tiers with resolved defaults and custom text without variables', async ({ page }) => {
    const saved: Array<Record<string, unknown>> = []
    await page.route('**/api/templates', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      const body = route.request().postDataJSON() as Record<string, unknown>
      saved.push(body)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `saved-${saved.length}`,
          ...body,
          userId: 'mock-user-id',
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
        }),
      })
    })
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-v2-save',
      analysisResponse: response,
    })

    await editor(page).getByLabel('Subject').fill('crystal vase')
    await page.getByRole('button', { name: 'Save as Style Memory' }).click()
    let dialog = page.getByRole('dialog', { name: 'Save as Template' })
    await expect(dialog).toContainText('Detected Variables (2)')
    await expect(dialog.getByLabel('Prompt Content')).toHaveValue(/{{subject}}/)
    await dialog.getByLabel('Template Name').fill('Structured standard')
    await dialog.getByRole('button', { name: 'Save Template' }).click()
    await expect.poll(() => saved.length).toBe(1)
    expect(saved[0].variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'subject', defaultValue: 'crystal vase' }),
    ]))

    await editor(page).getByRole('button', { name: 'Edit as custom text' }).click()
    await editor(page).getByLabel('Custom prompt').fill('freeform custom style prompt')
    await page.getByRole('button', { name: 'Save as Style Memory' }).click()
    dialog = page.getByRole('dialog', { name: 'Save as Template' })
    await expect(dialog.getByText(/Detected Variables/)).toHaveCount(0)
    await dialog.getByLabel('Template Name').fill('Custom prompt')
    await dialog.getByRole('button', { name: 'Save Template' }).click()
    await expect.poll(() => saved.length).toBe(2)
    expect(saved[1]).toMatchObject({
      content: 'freeform custom style prompt',
      variables: [],
    })
  })
})
