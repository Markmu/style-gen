import { expect, test, type Page } from '@playwright/test'
import { mockGenerationList } from './helpers/mock-api'
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

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const SAVED_TEMPLATE_ID = 'saved-template-with-defaults'

async function mockSavedTemplateApi(page: Page) {
  // 与真实 API 一致：详情回显创建请求提交的 name/content/variables 与来源字段，
  // 保障 Style Memory 卡片与 Use memory 的 source-backed 快照路径可用
  const savedTemplate: Record<string, unknown> = {
    id: SAVED_TEMPLATE_ID,
    name: 'Auto template',
    content: autoTemplateResponse.analysisTemplateContent,
    variables: autoTemplateResponse.analysisTemplateVariables,
    userId: 'mock-user-id',
    sourceAssetId: 'mock-asset-id',
    sourceImageUrl: 'https://cdn.example.com/references/mock-asset-id/original.png',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
  }
  let savedBody: Record<string, unknown> = {}

  // 单一分发（参照 template.spec）：**/api/templates** 同时覆盖列表（带 query）、
  // 创建与详情路径，避免裸 **/api/templates 匹配不到查询串
  await page.route('**/api/templates**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname

    if (pathname === '/api/templates' && request.method() === 'POST') {
      savedBody = (request.postDataJSON() ?? {}) as Record<string, unknown>
      savedTemplate.name = savedBody.name ?? savedTemplate.name
      savedTemplate.content = savedBody.content ?? savedTemplate.content
      savedTemplate.variables = savedBody.variables ?? savedTemplate.variables
      savedTemplate.sourceAssetId =
        typeof savedBody.sourceAssetId === 'string' ? savedBody.sourceAssetId : null
      savedTemplate.sourceImageUrl =
        typeof savedBody.sourceImageUrl === 'string' ? savedBody.sourceImageUrl : null
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(savedTemplate),
      })
      return
    }

    if (pathname === '/api/templates' && request.method() === 'GET') {
      const variables = Array.isArray(savedTemplate.variables) ? savedTemplate.variables : []
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: SAVED_TEMPLATE_ID,
              name: savedTemplate.name,
              variableCount: variables.length,
              sourceAssetId: savedTemplate.sourceAssetId,
              sourceImageUrl: savedTemplate.sourceImageUrl,
              createdAt: '2026-05-14T00:00:00.000Z',
            },
          ],
          hasMore: false,
          nextCursor: null,
        }),
      })
      return
    }

    if (pathname === `/api/templates/${SAVED_TEMPLATE_ID}` && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(savedTemplate),
      })
      return
    }

    await route.continue()
  })
  // 卡片封面与 Use memory 后工作台的参考图都指向 cdn.example.com
  await page.route('https://cdn.example.com/**', async (route) => {
    if (
      route.request().resourceType() === 'image' ||
      /\.(png|jpg|jpeg|webp)$/.test(route.request().url())
    ) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      return
    }
    await route.continue()
  })

  return {
    get savedBody() {
      return savedBody
    },
  }
}

test.describe('template default values', () => {
  test('saves current automatic template variables and reloads them by templateId', async ({ page }) => {
    const api = await mockSavedTemplateApi(page)
    await mockGenerationList(page)

    await uploadAndCompleteAnalysis(page, {
      analysisTaskId: 'template-default-analysis-task',
      analysisResponse: autoTemplateResponse,
    })

    await page.getByLabel('Prompt mode').selectOption('variables')
    await page.getByLabel('Variable subject').fill('brushed steel lily')
    // 保存入口现名 "Save as Style Memory"（保存弹窗仍名为 "Save as Template"）
    await page.getByRole('button', { name: 'Save as Style Memory' }).click()
    await page.getByLabel('Template Name').fill('Auto template')
    await page.getByRole('button', { name: 'Save Template' }).click()
    await expect(page.getByRole('dialog', { name: 'Save as Template' })).not.toBeVisible()

    expect(api.savedBody.sourceAnalysisTaskId).toBe('template-default-analysis-task')
    expect(api.savedBody.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'subject',
          label: 'Subject',
          defaultValue: 'brushed steel lily',
          sourceField: 'subject',
        }),
      ]),
    )

    // 现行重载路径：Style Memory 卡片 "Use memory" 以 source-backed 快照预写工作台，
    // 再经 /workspace?templateId= 进入，变量按保存的 defaultValue 加载
    await page.goto('/workspace/templates', { waitUntil: 'commit' })
    await page.getByRole('heading', { name: 'Auto template' }).hover()
    const useMemoryButton = page.getByRole('button', { name: 'Use memory' })
    await expect(useMemoryButton).toBeVisible({ timeout: 5000 })
    await useMemoryButton.click()

    // templateId 参数被消费后 URL 回落到 /workspace
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible({ timeout: 15000 })
    await page.getByLabel('Prompt mode').selectOption('variables')
    await expect(page.getByLabel('Variable subject')).toHaveValue('brushed steel lily')
  })
})
