import { generateCurrentDraft } from './helpers/workspace-actions';
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { resolve } from 'path'
import {
  loadFixture, mockAuthSession, mockCdnImages, mockGenerationList,
  mockUploadPresign, mockAnalysisCreate, mockAnalysisPolling,
mockTemplateCreateCapture, mockGenerationCreateSequence,
  mockDirectionFeedStateful, mockGenerationDetail,
} from './helpers/mock-api'
import { gotoWorkspace } from './helpers/workspace-actions'
import { waitForReactInput } from './helpers/react-ready'

async function prepare(page: Page) {
  await mockAuthSession(page)
  await mockCdnImages(page)
  await mockGenerationList(page)
  await mockUploadPresign(page)
  await mockAnalysisCreate(page, 'refinement-analysis')
}
async function upload(page: Page) {
  const input = page.getByTestId('reference-card').locator('input[type="file"]').first()
  await waitForReactInput(input)
  await input.setInputFiles(resolve(__dirname, 'fixtures/test-image.png'))
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1280, height: 720 }]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`workspace refinement ${viewport.width}x${viewport.height} ${theme}`, async ({ page }, info) => {
      test.setTimeout(60000)
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await prepare(page)
      const feed = await mockDirectionFeedStateful(page, { completed: [], active: null, latestFailure: null })
      await gotoWorkspace(page)
      await expect(page.getByTestId('ai-copilot-ribbon')).not.toContainText('Confidence')
      await expect(page.getByTestId('ai-copilot-ribbon')).not.toContainText('Ready')
      const dock = page.getByTestId('generation-bar')
      const generate = dock.getByRole('button', { name: 'Generate 1 image', exact: true })
      if (viewport.width >= 1280) await expect(generate).toBeInViewport()
      await capture(page, info, '01-empty')
      await mockAnalysisPolling(page, 'refinement-analysis', { id: 'refinement-analysis', status: 'processing', recipe: null, promptText: null })
      await upload(page)
      await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analyzing')
      await capture(page, info, '03-analyzing')
      await mockAnalysisPolling(page, 'refinement-analysis', { ...loadFixture('analysis-v2-completed.json'), id: 'refinement-analysis' })
  await page.getByRole('tablist', { name: 'Workspace inspector' }).getByRole('tab', { name: 'Prompt', exact: true }).click()
      await expect(page.getByTestId('structured-prompt-editor')).toBeVisible({ timeout: 15000 })
      const subject = page.getByLabel('Subject', { exact: true })
      if (viewport.width >= 1280) await expect(generate).toBeInViewport()
      await subject.scrollIntoViewIfNeeded()
      await expect(subject).toBeInViewport()
      await subject.fill('blue ceramic bowl')
      await expect(page.getByTestId('compiled-prompt-text')).toContainText('blue ceramic bowl')
      await expect(page.getByTestId('structured-prompt-editor').getByLabel('Prompt mode')).toHaveCount(0)
      await capture(page, info, '04-editing')
      await page.getByRole('button', { name: 'Save as Style Memory', exact: true }).click()
      const dialog = page.getByTestId('save-style-memory-dialog')
      await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused()
      await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Save Style Memory', exact: true })).toBeVisible()
      await capture(page, info, '05-draft-save')
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      const resultId = 'refinement-result'
      const source = loadFixture('analysis-v2-completed.json') as { recipe: object }
      await mockGenerationCreateSequence(page, [
        { status: 503, body: { error: 'Rendering unavailable. Retry.', code: 'SERVICE_UNAVAILABLE', retryable: true } },
        { taskId: resultId },
      ])
      await mockGenerationDetail(page, resultId, {
        ...loadFixture('generation-completed.json'), analysisTaskId: 'refinement-analysis',
        recipe: source.recipe, recipeSource: 'snapshot', variables: [], variablesSource: 'snapshot',
        sourceAssetId: 'mock-asset-id', sourceImageUrl: 'https://cdn.example.com/references/mock-asset-id/original.png',
      })
      await generateCurrentDraft(page)
      await expect(dock.getByRole('alert')).toBeVisible()
      await capture(page, info, '06-render-error')
      feed.set({ completed: [{
        id: resultId, status: 'completed', promptSummary: 'Blue ceramic bowl',
        resultFileUrl: 'https://cdn.example.com/results/refinement-result.webp', resultAssetId: 'render-asset',
        params: { aspectRatio: '1:1', quality: 'standard' }, createdAt: '2026-09-06T00:00:00Z', errorMessage: null,
      }], active: null, latestFailure: null })
      await page.route('**/api/generation?requestKey=*',route=>route.fulfill({json:{task:null}}))
      await dock.getByRole('button',{name:'Check original submission'}).click()
      await dock.getByRole('button',{name:'Confirm original submission'}).click()
      await expect(page.getByTestId('direction-completed-item')).toBeVisible()
      if (viewport.width >= 1280) await expect(generate).toBeInViewport()
      await capture(page, info, '07-result')
      const compare = page.getByTestId('direction-item-compare')
      await expect(compare).toHaveAccessibleName('Compare with reference')
      await compare.click()
      await expect(page.getByTestId('comparison-panel-title')).toBeFocused()
      await capture(page, info, '08-comparison')
      await page.getByTestId('comparison-adjustment-cancel').click()
      await expect(compare).toBeFocused()

    })
  }
}

test('single-page draft save preserves defaults and edits across a failed submission', async ({ page }) => {
  await prepare(page)
  await mockAnalysisPolling(page, 'refinement-analysis', { ...loadFixture('analysis-v2-completed.json'), id: 'refinement-analysis' })
  const save = await mockTemplateCreateCapture(page, [
    { status: 503, body: { error: 'Saving unavailable. Retry.' } },
    { status: 201, body: { id: 'refined-memory', name: 'My style' } },
  ])
  await gotoWorkspace(page)
  await upload(page)
  await page.getByRole('tablist', { name: 'Workspace inspector' }).getByRole('tab', { name: 'Prompt', exact: true }).click()
  await expect(page.getByTestId('structured-prompt-editor')).toBeVisible()
  await page.getByRole('button', { name: 'Save as Style Memory', exact: true }).click()
  const dialog = page.getByTestId('save-style-memory-dialog')
  await dialog.getByLabel('Name', { exact: true }).fill('My style')
  await dialog.getByRole('button', { name: 'Save Style Memory', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Saving unavailable')
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('My style')
  expect(save.requests[0].body.retainedRules).not.toEqual([])
  expect(save.requests[0].body.variables).not.toEqual([])
  expect(save.requests[0].body).not.toHaveProperty('representativeGenerationTaskId')
  await dialog.getByRole('button', { name: 'Adjust saved content', exact: true }).click()
  await dialog.getByLabel('Subject', { exact: true }).fill('silver bowl')
  await dialog.getByRole('button', { name: 'Save Style Memory', exact: true }).click()
  await expect.poll(() => save.requests.length).toBe(2)
  expect(save.requests[1].body.variables).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'subject', defaultValue: 'silver bowl' })]))
  // plan-10（AC-18）：工作区草稿保存留在当前方向，committed 后由页面刷新回读，不跳转详情
  await expect(dialog).toBeHidden()
  expect(page.url()).toContain('/workspace')
  expect(page.url()).not.toContain('/workspace/templates/')
})


test('evidence location is repeatable and does not steal focus during subsequent editing', async ({ page }) => {
  await prepare(page)
  await mockAnalysisPolling(page, 'refinement-analysis', loadFixture('analysis-v2-completed.json'))
  await gotoWorkspace(page)
  await upload(page)
  await page.getByRole('tablist', { name: 'Workspace inspector' }).getByRole('tab', { name: 'Prompt', exact: true }).click()
  const controls = page.getByTestId('prompt-intent-controls')
  await expect(controls).toBeVisible()
  await page.getByRole('tablist', { name: 'Workspace inspector' }).getByRole('tab', { name: 'Evidence', exact: true }).click()
  await page.getByTestId('evidence-facet-color').click()
  const observation = page.getByTestId('recipe-card').getByRole('button', { name: /^Show in prompt:.*warm amber/ })
  await observation.click()
  const linked = page.getByTestId('structured-variable-prompt').locator('textarea')
  await expect(linked).toBeFocused()
  const subject = page.getByLabel('Subject', { exact: true })
  await subject.fill('silver bowl')
  await expect(subject).toBeFocused()
  await page.getByRole('tablist', { name: 'Workspace inspector' }).getByRole('tab', { name: 'Evidence', exact: true }).click()
  await observation.click()
  await expect(linked).toBeFocused()
  await controls.getByTestId('editor-mode-option-text').click()
  const fulltext = page.getByTestId('fulltext-prompt-editor')
  const custom = 'My custom scene with warm amber and sand palette'
  await fulltext.fill(custom)
  await page.getByRole('tablist', { name: 'Workspace inspector' }).getByRole('tab', { name: 'Evidence', exact: true }).click()
  await observation.click()
  await expect(fulltext).toBeFocused()
  await expect(fulltext).toHaveValue(custom)
  await expect(controls).toHaveAttribute('data-editor-mode', 'text')
})
