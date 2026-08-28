import { expect, test, type Page } from '@playwright/test'
import { mockAuthSession } from './helpers/mock-api'
import { uploadAndCompleteAnalysis } from './helpers/workspace-actions'
import type { TemplateVariable } from '../src/types/models'

interface MockTemplate {
  id: string
  name: string
  content: string
  variables: TemplateVariable[]
  userId: string
  /** plan-04：列表新 DTO 字段（verificationStatus 等由 mock 提供） */
  verificationStatus: 'user_verified' | 'pending_verification'
  retainedRulesPreview: string[]
  representativeImageUrl: string | null
  lastUsedAt: string | null
  sourceAssetId?: string | null
  sourceImageUrl?: string | null
  createdAt: string
  updatedAt: string
}

function templateRecord(overrides: Partial<MockTemplate> = {}): MockTemplate {
  const now = '2026-05-16T00:00:00.000Z'
  return {
    id: overrides.id ?? `template-${Math.random().toString(36).slice(2)}`,
    name: overrides.name ?? 'Editorial Glass Poster',
    content: overrides.content ?? 'Create {{subject}} in {{scene}} with hard rim light.',
    variables: overrides.variables ?? [
      { name: 'subject', label: 'Subject', defaultValue: 'glass sculpture', sourceField: 'subject' },
      { name: 'scene', label: 'Scene', defaultValue: 'white studio', sourceField: 'scene' },
    ],
    userId: 'mock-user-id',
    verificationStatus: overrides.verificationStatus ?? 'pending_verification',
    retainedRulesPreview: overrides.retainedRulesPreview ?? ['硬光轮廓与高对比'],
    representativeImageUrl: overrides.representativeImageUrl ?? null,
    lastUsedAt: overrides.lastUsedAt ?? null,
    sourceAssetId: overrides.sourceAssetId ?? null,
    sourceImageUrl: overrides.sourceImageUrl ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

async function mockHistoryList(page: Page) {
  await page.route('**/api/generation?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], nextCursor: null }),
    })
  })
}

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function mockTemplateApi(page: Page, initialTemplates: MockTemplate[] = []) {
  const templates = [...initialTemplates]
  const createdBodies: Record<string, unknown>[] = []

  await mockAuthSession(page)
  await mockHistoryList(page)
  // 卡片与 Use memory 后工作台的参考图都指向 cdn.example.com
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

  await page.route('**/api/templates**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const method = request.method()

    if (!pathname.startsWith('/api/templates')) {
      await route.continue()
      return
    }

    if (pathname === '/api/templates' && method === 'GET') {
      const search = url.searchParams.get('search')?.trim().toLowerCase() ?? ''
      const status = url.searchParams.get('status')
      let filtered = templates
      if (status && status !== 'all') {
        filtered = filtered.filter(
          (template) => template.verificationStatus === status,
        )
      }
      if (search) {
        filtered = filtered.filter((template) =>
          [
            template.name,
            template.content,
            template.sourceAssetId ?? '',
            template.sourceImageUrl ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(search),
        )
      }

      // plan-04：列表页消费 plan-02 新 DTO（StyleMemoryListItem）
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: filtered.map((template) => ({
            id: template.id,
            name: template.name,
            verificationStatus: template.verificationStatus,
            retainedRulesPreview: template.retainedRulesPreview,
            variableCount: template.variables.length,
            sourceImageUrl: template.sourceImageUrl ?? null,
            representativeImageUrl: template.representativeImageUrl ?? null,
            lastUsedAt: template.lastUsedAt ?? null,
            updatedAt: template.updatedAt,
          })),
          hasMore: false,
          nextCursor: null,
        }),
      })
      return
    }

    if (pathname === '/api/templates' && method === 'POST') {
      const body = request.postDataJSON() as {
        name: string
        content: string
        variables?: TemplateVariable[]
        sourceAnalysisTaskId?: string
        sourceAssetId?: string | null
        sourceImageUrl?: string | null
      }
      createdBodies.push(body)

      if (templates.some((template) => template.name === body.name)) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'A template with this name already exists' }),
        })
        return
      }

      const created = templateRecord({
        id: `created-template-${templates.length + 1}`,
        name: body.name,
        content: body.content,
        variables: body.variables ?? [],
        sourceAssetId:
          typeof body.sourceAssetId === 'string' ? body.sourceAssetId : null,
        sourceImageUrl:
          typeof body.sourceImageUrl === 'string' ? body.sourceImageUrl : null,
      })
      templates.unshift(created)

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      })
      return
    }

    const duplicateMatch = pathname.match(/^\/api\/templates\/([^/]+)\/duplicate$/)
    if (duplicateMatch && method === 'POST') {
      const source = templates.find((template) => template.id === duplicateMatch[1])
      if (!source) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Template not found' }),
        })
        return
      }

      const copy = templateRecord({
        id: `${source.id}-copy`,
        name: `${source.name} (copy)`,
        content: source.content,
        variables: source.variables,
        sourceAssetId: source.sourceAssetId,
        sourceImageUrl: source.sourceImageUrl,
      })
      templates.unshift(copy)

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(copy),
      })
      return
    }

    const detailMatch = pathname.match(/^\/api\/templates\/([^/]+)$/)
    if (detailMatch && method === 'GET') {
      const template = templates.find((item) => item.id === detailMatch[1])
      // plan-06：保存成功直接进入新详情（plan-05 详情页消费 plan-02
      // StyleMemoryDetail DTO）；按既有 record 合成完整详情形态
      const detailDto = template
        ? {
            ...template,
            description: null,
            retainedRules: template.retainedRulesPreview ?? [],
            negativeConstraints: [],
            styleTokens: [],
            enhancementHints: [],
            representativeGenerationTaskId: null,
            sourceGenerationTaskId: null,
            sourceGenerationTask: null,
            representativeResult: null,
            usage: { lastUsedAt: template.lastUsedAt ?? null, derivedIterationCount: 0 },
          }
        : null
      await route.fulfill({
        status: template ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(detailDto ?? { error: 'Template not found' }),
      })
      return
    }

    if (detailMatch && method === 'DELETE') {
      const index = templates.findIndex((item) => item.id === detailMatch[1])
      if (index === -1) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Template not found' }),
        })
        return
      }
      templates.splice(index, 1)
      await route.fulfill({ status: 204, body: '' })
      return
    }

    await route.fulfill({
      status: 405,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Method not allowed' }),
    })
  })

  return { templates, createdBodies }
}

async function reachPromptEditor(page: Page, analysisTaskId = 'template-analysis-task') {
  await uploadAndCompleteAnalysis(page, { analysisTaskId })
  // 触发按钮在 prompt-card 内，现行为 "Save as Style Memory"；弹窗仍名为 "Save as Template"
  await expect(page.getByRole('button', { name: 'Save as Style Memory' })).toBeVisible({ timeout: 15000 })
}

test.describe('模板功能', () => {
  test('保存当前 Prompt 为 Style Memory 并提交分析任务来源', async ({ page }) => {
    const api = await mockTemplateApi(page)
    await reachPromptEditor(page, 'template-save-source-task')

    await page.getByRole('button', { name: 'Save as Style Memory' }).click()
    // plan-06 三步向导（流程 B：规则确认 → 命名；完整提示在步骤 3 高级信息内）
    const saveWizard = page.getByTestId('save-style-memory-dialog')
    await expect(saveWizard).toBeVisible()
    await saveWizard.getByRole('button', { name: /^Next$/ }).click()
    await saveWizard.getByRole('textbox', { name: /name/i }).first().fill('Saved prompt template')
    await saveWizard.getByRole('button', { name: /^Sav/i }).click()

    // 保存成功直接进入新 Memory 详情（plan-05 详情路由）
    await expect(page).toHaveURL(/\/workspace\/templates\/created-template-1$/, {
      timeout: 15000,
    })
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })
    expect(api.createdBodies[0]).toEqual(
      expect.objectContaining({
        name: 'Saved prompt template',
        sourceAnalysisTaskId: 'template-save-source-task',
      }),
    )
    expect(String(api.createdBodies[0].content)).toContain('sunset')
  })

  test('旧分析检测到的模板变量在向导确认后随保存提交', async ({ page }) => {
    const api = await mockTemplateApi(page)
    await reachPromptEditor(page)

    // plan-06 流程 B：V1 分析派生的可替换变量（负面提示伪变量）同屏确认、
    // 默认值可编辑；编辑值随提交体携带，不虚构配方外变量
    const saveWizard = page.getByTestId('save-style-memory-dialog')
    await page.getByRole('button', { name: 'Save as Style Memory' }).click()
    await expect(saveWizard).toBeVisible()
    const defaultValueInput = saveWizard.getByLabel(/negative/i)
    await expect(defaultValueInput).toHaveValue(/blurry, low quality/)
    await defaultValueInput.fill('no grain, no watermark')
    await saveWizard.getByRole('button', { name: /^Next$/ }).click()
    await saveWizard.getByRole('textbox', { name: /name/i }).first().fill('Detected variable memory')
    await saveWizard.getByRole('button', { name: /^Sav/i }).click()

    await expect(page).toHaveURL(/\/workspace\/templates\/created-template-1$/, {
      timeout: 15000,
    })
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })
    expect(api.createdBodies[0].variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'negative_prompt', defaultValue: 'no grain, no watermark' }),
      ]),
    )
  })

  test('空名称提交展示校验错误且零请求', async ({ page }) => {
    await mockTemplateApi(page)
    await reachPromptEditor(page)

    await page.getByRole('button', { name: 'Save as Style Memory' }).click()
    const saveWizard = page.getByTestId('save-style-memory-dialog')
    await saveWizard.getByRole('button', { name: /^Next$/ }).click()
    await saveWizard.getByRole('button', { name: /^Sav/i }).click()

    await expect(saveWizard.getByText(/cannot be empty/)).toBeVisible()
  })

  test('template with this name展示冲突错误', async ({ page }) => {
    await mockTemplateApi(page, [templateRecord({ id: 'existing-template', name: 'Duplicate name' })])
    await reachPromptEditor(page)

    await page.getByRole('button', { name: 'Save as Style Memory' }).click()
    const saveWizard = page.getByTestId('save-style-memory-dialog')
    await saveWizard.getByRole('button', { name: /^Next$/ }).click()
    await saveWizard.getByRole('textbox', { name: /name/i }).first().fill('Duplicate name')
    await saveWizard.getByRole('button', { name: /^Sav/i }).click()

    await expect(page.getByText('A template with this name already exists')).toBeVisible()
  })

  test('Style Memory展示列表并支持搜索', async ({ page }) => {
    await mockTemplateApi(page, [
      templateRecord({
        id: 'library-template-1',
        name: 'Editorial Glass Poster',
        verificationStatus: 'user_verified',
        retainedRulesPreview: ['低饱和暖灰基调', '柔和漫射光'],
        representativeImageUrl: 'https://cdn.example.com/results/library-1/representative.webp',
        lastUsedAt: '2026-05-15T00:00:00.000Z',
        sourceAssetId: 'source-asset-1',
        sourceImageUrl: 'https://cdn.example.com/references/source-asset-1/original.png',
      }),
      templateRecord({ id: 'library-template-2', name: 'Soft Product Macro', variables: [] }),
    ])

    await page.goto('/workspace/templates', { waitUntil: 'commit' })

    await expect(page.getByRole('heading', { name: 'Style Memory' })).toBeVisible()
    await expect(page.getByText(/Template Library/i)).toHaveCount(0)
    await expect(page.getByText('Editorial Glass Poster')).toBeVisible()
    await expect(page.getByText('Soft Product Macro')).toBeVisible()
    await expect(page.getByTestId('style-memory-card').first()).toBeVisible()
    // plan-04 新卡片：验证徽标 + 真实规则摘要 + 变量数；无名称派生标签
    await expect(page.getByText('User verified').first()).toBeVisible()
    await expect(page.getByText('低饱和暖灰基调').first()).toBeVisible()
    await expect(page.getByText('2 variables').first()).toBeVisible()
    await expect(page.getByText(/Source-backed|Prompt-only|Style tags|Reuse intent/i)).toHaveCount(0)

    // 搜索框 aria 承载全量谓词口径（plan-04：placeholder 精简、aria 全量）
    const searchBox = page.getByRole('textbox', { name: /Search Style Memory/ })
    await searchBox.fill('glass')
    await expect(page.getByText('Editorial Glass Poster')).toBeVisible()
    await expect(page.getByText('Soft Product Macro')).not.toBeVisible()
  })

  test('使用按钮跳转Workspace并按默认值加载变量', async ({ page }) => {
    // 现行“使用”通过 source-backed 快照（sourceAssetId+sourceImageUrl+content）
    // 预写工作台快照，再经 /workspace?templateId= 进入，变量按 defaultValue 加载
    const template = templateRecord({
      id: 'library-template-use',
      name: 'Default Value Template',
      sourceAssetId: 'use-memory-source-asset',
      sourceImageUrl: 'https://cdn.example.com/references/use-memory-source/original.png',
    })
    await mockTemplateApi(page, [template])

    await page.goto('/workspace/templates', { waitUntil: 'commit' })
    await page.getByRole('heading', { name: template.name }).hover()
    const useMemoryButton = page.getByRole('button', { name: 'Use', exact: true })
    await expect(useMemoryButton).toBeVisible({ timeout: 5000 })
    await useMemoryButton.click()

    // plan-07：「使用」接管为复用预检；本模板变量均含默认值（无必填门），
    // 确认后经快照握手进入 /workspace?templateId= 并回落
    const reusePrecheck = page.getByTestId('reuse-precheck-dialog')
    await expect(reusePrecheck).toBeVisible({ timeout: 15000 })
    await reusePrecheck.getByRole('button', { name: /^Enter workspace$/ }).click()

    // templateId 参数被消费后 URL 回落到 /workspace（区别于 /workspace/templates）
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible({ timeout: 15000 })
    await page.getByLabel('Prompt mode').selectOption('variables')
    await expect(page.getByLabel('Variable subject')).toHaveValue('glass sculpture')
    await expect(page.getByLabel('Variable scene')).toHaveValue('white studio')
    await page.getByLabel('Prompt mode').selectOption('text')
    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue(
      'Create glass sculpture in white studio with hard rim light.',
    )
  })

  // plan-04 起，卡片只保留“View details / Use”；复制与删除等治理动作集中在
  // 详情页（PRD“详情为统一入口”）。Duplicate/Delete 的 API 契约由
  // src/app/api/templates/__tests__/route.test.ts 覆盖，卡片上的 UI 入口用例随之移除。
})
