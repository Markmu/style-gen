import { expect, test } from '@playwright/test'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'

const autoTemplateResponse = {
  id: 'template-default-analysis-task',
  sourceAssetId: 'mock-asset-id',
  status: 'completed',
  recipe: {
    imageSummary: 'A chrome orchid in a white studio',
    subject: 'chrome orchid',
    scene: 'white studio',
    composition: 'asymmetric product framing',
    cameraLanguage: 'macro lens',
    lighting: 'large softbox reflection',
    color: 'white, chrome, and pale blue',
    texture: 'mirror metal petals',
    styleTags: ['product', 'macro', 'precision'],
    mood: 'clean and premium',
    visualKeywords: ['chrome orchid', 'softbox', 'white studio'],
    mustKeep: ['chrome material', 'clean studio'],
    replaceable: ['flower species'],
  },
  promptText: 'Create chrome orchid in white studio with premium product precision.',
  negativePromptText: '',
  rawResponse: 'raw analysis text',
  errorMessage: null,
  errorStage: null,
  analysisTemplateContent:
    'Create {{subject}} in {{scene}} with {{visual_style}}.',
  analysisTemplateVariables: [
    { name: 'subject', label: 'Subject', defaultValue: 'chrome orchid', sourceField: 'subject' },
    { name: 'scene', label: 'Scene', defaultValue: 'white studio', sourceField: 'scene' },
    { name: 'visual_style', label: 'Visual style', defaultValue: 'premium product precision', sourceField: 'visual_style' },
  ],
  analysisTemplateStatus: 'ready',
  analysisTemplateReason: null,
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:01.000Z',
}

test.describe('template default values', () => {
  test('saves current automatic template variables and reloads them by templateId', async ({ page }) => {
    let savedBody: Record<string, unknown> = {}
    const savedTemplate = {
      id: 'saved-template-with-defaults',
      name: 'Auto template',
      content: autoTemplateResponse.analysisTemplateContent,
      variables: [
        { name: 'subject', label: 'Subject', defaultValue: 'brushed steel lily', sourceField: 'subject' },
        { name: 'scene', label: 'Scene', defaultValue: 'white studio', sourceField: 'scene' },
        { name: 'visual_style', label: 'Visual style', defaultValue: 'premium product precision', sourceField: 'visual_style' },
      ],
      userId: 'mock-user-id',
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: '2026-05-14T00:00:00.000Z',
    }

    await page.route('**/api/templates', async (route) => {
      if (route.request().method() === 'POST') {
        savedBody = route.request().postDataJSON()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(savedTemplate),
        })
      } else {
        await route.continue()
      }
    })
    await page.route('**/api/templates/saved-template-with-defaults', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(savedTemplate),
      })
    })

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'template-default-analysis-task',
      analysisResponse: autoTemplateResponse,
    })

    await page.getByLabel('Variable subject').fill('brushed steel lily')
    await page.getByRole('button', { name: 'Save as Template' }).click()
    await page.getByLabel('Template Name').fill('Auto template')
    await page.getByRole('button', { name: 'Save Template' }).click()

    expect(savedBody.sourceAnalysisTaskId).toBe('template-default-analysis-task')
    expect(savedBody.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'subject',
          label: 'Subject',
          defaultValue: 'brushed steel lily',
          sourceField: 'subject',
        }),
      ]),
    )

    await page.goto('/workspace?templateId=saved-template-with-defaults', { waitUntil: 'commit' })
    await expect(page.getByLabel('Variable subject')).toHaveValue('brushed steel lily')
  })
})
