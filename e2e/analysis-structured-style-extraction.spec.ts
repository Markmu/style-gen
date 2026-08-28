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

  test('shows keyword-first evidence and generates the edited variable prompt', async ({ page }) => {
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
    await expect(editor(page).getByLabel('Prompt mode')).toHaveValue('variables')
    await page.getByTestId('evidence-facet-visualMedium').click()
    await expect(page.getByText('Natural photographic highlights')).toBeVisible()
    await expect(page.getByText(/Observed:/i)).toHaveCount(0)
    await expect(page.getByTestId('evidence-facet-visualMedium')).toContainText('90%')
    await expect(page.locator('[data-testid^="reference-anchor-"]')).toHaveCount(0)

    await editor(page).getByLabel('Subject').fill('red ceramic stool')
    await expect(editor(page).getByLabel('Variable-linked prompt preview')).toHaveValue(/red ceramic stool/)
    await editor(page).getByLabel('Variable-linked prompt preview').fill(
      'Render red ceramic stool with soft directional window light and quiet editorial balance.',
    )
    await generateButton(page).click()

    expect(generationRequest.promptText).toContain('red ceramic stool')
    expect(generationRequest.promptText).toContain('soft directional window light')
    expect(generationRequest.promptText).not.toContain('{{')
    expect(generationRequest.negativePromptText).toBe('watermark, distorted glass')
  })

  test('preserves full text while JSON is inspected, restores edits, and clears on Replace', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-v2-persistence',
      analysisResponse: response,
    })

    await editor(page).getByLabel('Prompt mode').selectOption('text')
    await editor(page).getByLabel('Full Generation Prompt').fill('hand tuned persistent draft')
    await editor(page).getByLabel('Prompt mode').selectOption('json')
    const jsonOutput = editor(page).getByTestId('structured-json-output')
    await expect(jsonOutput).toContainText('An amber bottle on folded linen')
    await expect(jsonOutput).toContainText('editorial product photography')
    await expect(jsonOutput).not.toContainText('hand tuned persistent draft')
    await expect(jsonOutput).not.toContainText('confidence')
    await expect(jsonOutput).not.toContainText('workspace')
    await expect(generateButton(page)).toBeEnabled()
    await editor(page).getByLabel('Prompt mode').selectOption('text')
    await page.waitForTimeout(400)
    await page.reload()

    await expect(editor(page)).toBeVisible({ timeout: 15000 })
    await expect(editor(page).getByLabel('Full Generation Prompt')).toHaveValue('hand tuned persistent draft')
    await page.getByTestId('reference-card').getByRole('button', { name: 'Replace' }).click()
    await expect(editor(page)).toHaveCount(0)
    await expect(
      page.getByTestId('app-shell').getByTestId('reference-upload-panel'),
    ).toBeVisible()
  })

  test('saves reusable tiers with resolved defaults and custom text without variables', async ({ page }) => {
    const saved: Array<Record<string, unknown>> = []
    const createdDetail: Record<string, unknown> = {}
    await page.route('**/api/templates**', async (route) => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      if (pathname === '/api/templates' && request.method() === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>
        saved.push(body)
        Object.assign(createdDetail, {
          id: `saved-${saved.length}`,
          ...body,
          userId: 'mock-user-id',
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
        })
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdDetail),
        })
        return
      }
      // plan-06：保存成功直接进入新详情，按 plan-02 DTO 合成详情响应
      if (
        pathname.startsWith('/api/templates/') &&
        request.method() === 'GET' &&
        createdDetail.id === pathname.split('/')[2]
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...createdDetail,
            description: null,
            retainedRules: Array.isArray(createdDetail.retainedRules)
              ? createdDetail.retainedRules
              : [],
            negativeConstraints: [],
            styleTokens: [],
            enhancementHints: [],
            verificationStatus: 'pending_verification',
            representativeGenerationTaskId: null,
            sourceGenerationTaskId: null,
            sourceGenerationTask: null,
            representativeResult: null,
            usage: { lastUsedAt: null, derivedIterationCount: 0 },
          }),
        })
        return
      }
      await route.continue()
    })
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-v2-save',
      analysisResponse: response,
    })

    await editor(page).getByLabel('Subject').fill('crystal vase')
    await page.getByRole('button', { name: 'Save as Style Memory' }).click()
    // plan-06 三步向导（流程 B）：首屏规则确认（变量默认值同屏）→ 命名保存
    let wizard = page.getByTestId('save-style-memory-dialog')
    await expect(wizard).toBeVisible()
    await expect(wizard.getByLabel('Subject')).toHaveValue('crystal vase')
    await wizard.getByRole('button', { name: /^Next$/ }).click()
    await wizard.getByRole('textbox', { name: /name/i }).first().fill('Structured standard')
    await wizard.getByRole('button', { name: /^Sav/i }).click()
    await expect.poll(() => saved.length).toBe(1)
    expect(saved[0].variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'subject', defaultValue: 'crystal vase' }),
    ]))
    // 保存成功进入新详情
    await expect(page).toHaveURL(/\/workspace\/templates\/saved-1$/, { timeout: 15000 })

    // 第二轮（plan-06）：保存成功直接进入新详情；离开 /workspace 会经
    // WorkspacePersistenceGuard 清空工作台 sessionStorage 快照，回到工作台是
    // 全新状态。因此以新分析任务重新进入 analysis_ready，再验证文本模式
    // 自定义提示无变量保存。
    await page.goto('/workspace', { waitUntil: 'commit' }).catch(() => undefined)
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 15000 })
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-v2-save-text',
      analysisResponse: response,
    })
    await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analysis_ready', {
      timeout: 15000,
    })
    await editor(page).getByLabel('Prompt mode').selectOption('text')
    await editor(page).getByLabel('Full Generation Prompt').fill('freeform custom style prompt')
    await page.getByRole('button', { name: 'Save as Style Memory' }).click()
    wizard = page.getByTestId('save-style-memory-dialog')
    await expect(wizard).toBeVisible()
    await wizard.getByRole('button', { name: /^Next$/ }).click()
    await wizard.getByRole('textbox', { name: /name/i }).first().fill('Custom prompt')
    await wizard.getByRole('button', { name: /^Sav/i }).click()
    await expect.poll(() => saved.length).toBe(2)
    expect(saved[1]).toMatchObject({
      content: 'freeform custom style prompt',
      variables: [],
    })
  })
})
