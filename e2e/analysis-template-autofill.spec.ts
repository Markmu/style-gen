import { expect, test } from '@playwright/test'
import { mockGenerationPolling } from './helpers/mock-api'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

const readyTemplateResponse = {
  id: 'analysis-template-task',
  sourceAssetId: 'mock-asset-id',
  status: 'completed',
  recipe: {
    imageSummary: 'A glass fox in a neon rain garden',
    subject: 'glass fox',
    scene: 'neon rain garden',
    composition: 'centered editorial framing',
    cameraLanguage: 'medium format lens',
    lighting: 'blue rim light and soft silver fill',
    color: 'cyan, silver, and deep green',
    texture: 'polished glass and wet leaves',
    styleTags: ['editorial', 'glass', 'cinematic'],
    mood: 'quiet and precise',
    visualKeywords: ['glass fox', 'neon rain', 'rim light'],
    mustKeep: ['transparent glass subject', 'blue rim light'],
    replaceable: ['garden props'],
  },
  promptText:
    'Create glass fox inside neon rain garden with blue rim light and soft silver fill.',
  negativePromptText: 'low quality, blurry',
  rawResponse: 'raw analysis text',
  errorMessage: null,
  errorStage: null,
  analysisTemplateContent:
    'Create {{subject}} inside {{scene}} with {{visual_style}} and {{lighting_color}}.',
  analysisTemplateVariables: [
    { name: 'subject', label: 'Subject', defaultValue: 'glass fox', sourceField: 'subject' },
    { name: 'scene', label: 'Scene', defaultValue: 'neon rain garden', sourceField: 'scene' },
    { name: 'visual_style', label: 'Visual style', defaultValue: 'editorial glass realism', sourceField: 'visual_style' },
    { name: 'lighting_color', label: 'Lighting', defaultValue: 'blue rim light and soft silver fill', sourceField: 'lighting_color' },
  ],
  analysisTemplateStatus: 'ready',
  analysisTemplateReason: null,
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:01.000Z',
}

const fallbackTemplateResponse = {
  ...readyTemplateResponse,
  id: 'analysis-template-fallback-task',
  promptText: 'A usable full prompt from a difficult reference image.',
  analysisTemplateContent: null,
  analysisTemplateVariables: [],
  analysisTemplateStatus: 'fallback',
  analysisTemplateReason: 'Not enough stable variable candidates.',
}

const emptyVariableReadyResponse = {
  ...readyTemplateResponse,
  id: 'analysis-template-empty-variable-task',
  promptText: 'A rendered prompt that should stay editable.',
  analysisTemplateContent: 'Create {{subject}} from the reference.',
  analysisTemplateVariables: [],
  analysisTemplateStatus: 'ready',
  analysisTemplateReason: null,
}

test.describe('analysis template autofill', () => {
  test('defaults to template mode and prefills variables after analysis ready', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-ready-task',
      analysisResponse: readyTemplateResponse,
    })

    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(page.getByLabel('模板原文')).toHaveValue(/{{subject}}/)
    await expect(page.getByLabel('变量 subject')).toHaveValue('glass fox')
    await expect(page.getByLabel('变量 scene')).toHaveValue('neon rain garden')
    await expect(page.getByLabel('变量 visual_style')).toHaveValue('editorial glass realism')
    await expect(page.getByLabel('变量 lighting_color')).toHaveValue('blue rim light and soft silver fill')
  })

  test('generates from default values without unresolved template markers', async ({ page }) => {
    let requestBody: Record<string, unknown> = {}

    await page.route('**/api/generation', async (route) => {
      if (route.request().method() === 'POST') {
        requestBody = route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'analysis-template-generation-task', status: 'pending' }),
        })
      } else {
        await route.continue()
      }
    })
    await mockGenerationPolling(page, 'analysis-template-generation-task', {
      id: 'analysis-template-generation-task',
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-generate-task',
      analysisResponse: readyTemplateResponse,
    })

    await page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' }).click()

    expect(requestBody.promptText).toContain('glass fox')
    expect(requestBody.promptText).toContain('neon rain garden')
    expect(requestBody.promptText).not.toContain('{{')
    expect(requestBody.negativePromptText).toBe('')
  })

  test('uses edited variables for generation', async ({ page }) => {
    let requestBody: Record<string, unknown> = {}

    await page.route('**/api/generation', async (route) => {
      if (route.request().method() === 'POST') {
        requestBody = route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'analysis-template-edited-generation-task', status: 'pending' }),
        })
      } else {
        await route.continue()
      }
    })
    await mockGenerationPolling(page, 'analysis-template-edited-generation-task', {
      id: 'analysis-template-edited-generation-task',
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-edit-task',
      analysisResponse: readyTemplateResponse,
    })

    await page.getByLabel('变量 subject').fill('crystal heron')
    await page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' }).click()

    expect(requestBody.promptText).toContain('crystal heron')
    expect(requestBody.promptText).not.toContain('glass fox')
  })

  test('keeps manual text draft after template variables change', async ({ page }) => {
    let requestBody: Record<string, unknown> = {}

    await page.route('**/api/generation', async (route) => {
      if (route.request().method() === 'POST') {
        requestBody = route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'analysis-template-text-generation-task', status: 'pending' }),
        })
      } else {
        await route.continue()
      }
    })
    await mockGenerationPolling(page, 'analysis-template-text-generation-task', {
      id: 'analysis-template-text-generation-task',
      status: 'processing',
      resultFileUrl: null,
      errorMessage: null,
    })

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-text-task',
      analysisResponse: readyTemplateResponse,
    })

    await page.getByRole('button', { name: '文本模式' }).click()
    await page.getByLabel('完整生成提示').fill('Manual protected prompt')
    await page.getByRole('button', { name: '模板模式' }).click()
    await page.getByLabel('变量 subject').fill('changed subject')
    await page.getByRole('button', { name: '文本模式' }).click()
    await page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' }).click()

    expect(requestBody.promptText).toBe('Manual protected prompt')
  })

  test('falls back to text mode without an empty variable form', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-fallback-task',
      analysisResponse: fallbackTemplateResponse,
    })

    await expect(page.getByLabel('完整生成提示')).toHaveValue(
      'A usable full prompt from a difficult reference image.',
    )
    await expect(page.getByText('本次没有识别到足够稳定的可替换变量')).toBeVisible()
    await expect(page.getByLabel(/变量 subject/)).toHaveCount(0)
    await expect(page.getByTestId('light-generate-panel').getByRole('button', { name: 'GENERATE' })).toBeEnabled()
  })

  test('treats ready templates with no variables as text fallback', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-empty-variable-task',
      analysisResponse: emptyVariableReadyResponse,
    })

    await expect(page.getByLabel('完整生成提示')).toHaveValue(
      'A rendered prompt that should stay editable.',
    )
    await expect(page.getByText('本次没有识别到足够稳定的可替换变量')).toBeVisible()
    await expect(page.getByLabel('模板原文')).toHaveCount(0)
    await expect(page.getByLabel(/变量 subject/)).toHaveCount(0)
  })
})
