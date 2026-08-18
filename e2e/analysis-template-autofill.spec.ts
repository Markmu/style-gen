import { expect, test, type Page } from '@playwright/test'
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

// 现行编辑器默认以 variables 模式渲染 analysisTemplateContent，
// 切到 text 模式时未手动改动则展示按默认值解析后的模板结果。
const resolvedTemplatePrompt =
  'Create glass fox inside neon rain garden with editorial glass realism and blue rim light and soft silver fill.'

function renderGenerateButton(page: Page) {
  return page.getByTestId('output-card').first().getByRole('button', { name: /^Generate$/i })
}

test.describe('analysis template autofill', () => {
  test('defaults to variables mode and keeps the rendered text available in text mode', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-ready-task',
      analysisResponse: readyTemplateResponse,
    })

    // 现行默认：可用模板直接以 variables 模式呈现，模板源与变量输入立即可用
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible()
    await expect(page.getByLabel('Full Generation Prompt')).toHaveCount(0)
    await expect(page.getByTestId('template-mode-highlight-editor')).toBeVisible()
    await expect(page.getByLabel('Template Source')).toHaveValue(/{{subject}}/)
    await expect(page.getByLabel('Variable subject')).toHaveValue('glass fox')
    await expect(page.getByLabel('Variable scene')).toHaveValue('neon rain garden')
    await expect(page.getByLabel('Variable visual_style')).toHaveValue('editorial glass realism')
    await expect(page.getByLabel('Variable lighting_color')).toHaveValue('blue rim light and soft silver fill')

    // 切到 text 模式：未手动改动时展示按默认值解析后的完整提示词
    await page.getByLabel('Prompt mode').selectOption('text')
    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue(
      resolvedTemplatePrompt,
    )
    await expect(page.getByTestId('text-mode-highlight-editor')).toBeVisible()
    await expect(page.getByTestId('prompt-variable-token-subject')).toContainText('glass fox')
    const metrics = await page.getByTestId('text-mode-highlight-editor').evaluate((editor) => {
      const layer = editor.querySelector('.prompt-highlight-layer')
      const textarea = editor.querySelector('textarea')
      const token = editor.querySelector('[data-testid="prompt-variable-token-subject"]')
      if (!layer || !textarea || !token) return null

      const layerStyle = window.getComputedStyle(layer)
      const textareaStyle = window.getComputedStyle(textarea)
      const tokenStyle = window.getComputedStyle(token)

      return {
        layerFontSize: layerStyle.fontSize,
        textareaFontSize: textareaStyle.fontSize,
        layerLineHeight: layerStyle.lineHeight,
        textareaLineHeight: textareaStyle.lineHeight,
        tokenBorderLeftWidth: tokenStyle.borderLeftWidth,
        tokenMarginLeft: tokenStyle.marginLeft,
        tokenPaddingLeft: tokenStyle.paddingLeft,
      }
    })
    expect(metrics).not.toBeNull()
    expect(metrics?.layerFontSize).toBe(metrics?.textareaFontSize)
    expect(metrics?.layerLineHeight).toBe(metrics?.textareaLineHeight)
    expect(metrics?.tokenBorderLeftWidth).toBe('0px')
    expect(metrics?.tokenMarginLeft).toBe('0px')
    expect(metrics?.tokenPaddingLeft).toBe('0px')
    // text 模式下模板源不可见，切回 variables 模式后模板与变量保持可用
    await expect(page.getByLabel('Template Source')).toHaveCount(0)
    await page.getByLabel('Prompt mode').selectOption('variables')
    await expect(page.getByLabel('Template Source')).toHaveValue(/{{subject}}/)
    await expect(page.getByLabel('Variable subject')).toHaveValue('glass fox')
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

    await renderGenerateButton(page).click()

    expect(requestBody.promptText).toContain('glass fox')
    expect(requestBody.promptText).toContain('neon rain garden')
    expect(requestBody.promptText).not.toContain('{{')
    expect(requestBody.negativePromptText).toBe('low quality, blurry')
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

    await page.getByLabel('Prompt mode').selectOption('variables')
    await page.getByLabel('Variable subject').fill('crystal heron')
    await renderGenerateButton(page).click()

    expect(requestBody.promptText).toContain('crystal heron')
    expect(requestBody.promptText).not.toContain('glass fox')
  })

  test('keeps a variable linked when its resolved text is edited in text mode', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-inline-variable-edit-task',
      analysisResponse: readyTemplateResponse,
    })

    // 现行默认 variables 模式，需先切到 text 模式再编辑解析后的提示词
    await page.getByLabel('Prompt mode').selectOption('text')
    await page.getByLabel('Full Generation Prompt').fill(
      resolvedTemplatePrompt.replace('glass fox', 'crystal heron'),
    )

    await expect(page.getByTestId('prompt-variable-token-subject')).toContainText('crystal heron')
    await page.getByLabel('Prompt mode').selectOption('variables')
    await expect(page.getByLabel('Variable subject')).toHaveValue('crystal heron')
  })

  test('cycles colors for newly added template variables', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-variable-tone-task',
      analysisResponse: readyTemplateResponse,
    })

    await page.getByLabel('Prompt mode').selectOption('variables')
    await page.getByLabel('Template Source').fill(
      'Create {{subject}} in {{custom_scene}} with {{camera_angle}}.',
    )

    const tones = await page.locator('[data-testid^="prompt-variable-token-"][data-variable-tone]').evaluateAll(
      (tokens) => tokens
        .filter((token) => token.getAttribute('data-testid') !== 'prompt-variable-token-subject')
        .map((token) => token.getAttribute('data-variable-tone')),
    )
    expect(tones).toHaveLength(2)
    expect(tones[0]).not.toBe(tones[1])
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

    await page.getByLabel('Prompt mode').selectOption('text')
    await page.getByLabel('Full Generation Prompt').fill('Manual protected prompt')
    await page.getByLabel('Prompt mode').selectOption('variables')
    await page.getByLabel('Variable subject').fill('changed subject')
    await page.getByLabel('Prompt mode').selectOption('text')
    await renderGenerateButton(page).click()

    expect(requestBody.promptText).toBe('Manual protected prompt')
  })

  test('falls back to text mode without an empty variable form', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-fallback-task',
      analysisResponse: fallbackTemplateResponse,
    })

    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue(
      'A usable full prompt from a difficult reference image.',
    )
    await expect(page.getByText('No stable replaceable variables were detected this time.')).toBeVisible()
    await expect(page.getByLabel(/Variable subject/)).toHaveCount(0)
    await expect(renderGenerateButton(page)).toBeEnabled()
  })

  test('treats ready templates with no variables as text fallback', async ({ page }) => {
    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'analysis-template-empty-variable-task',
      analysisResponse: emptyVariableReadyResponse,
    })

    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue(
      'A rendered prompt that should stay editable.',
    )
    await expect(page.getByText('No stable replaceable variables were detected this time.')).toBeVisible()
    await expect(page.getByLabel('Template Source')).toHaveCount(0)
    await expect(page.getByLabel(/Variable subject/)).toHaveCount(0)
  })
})
