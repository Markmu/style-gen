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

async function mockTemplateApi(page: Page, initialTemplates: MockTemplate[] = []) {
  const templates = [...initialTemplates]
  const createdBodies: Record<string, unknown>[] = []

  await mockAuthSession(page)
  await mockHistoryList(page)

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
      const filtered = search
        ? templates.filter((template) => template.name.toLowerCase().includes(search))
        : templates

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: filtered.map((template) => ({
            id: template.id,
            name: template.name,
            variableCount: template.variables.length,
            createdAt: template.createdAt,
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
      await route.fulfill({
        status: template ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(template ?? { error: 'Template not found' }),
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
  await expect(page.getByRole('button', { name: 'Save as Template' })).toBeVisible({ timeout: 15000 })
}

test.describe('模板功能', () => {
  test('保存当前 Prompt 为模板并提交分析任务来源', async ({ page }) => {
    const api = await mockTemplateApi(page)
    await reachPromptEditor(page, 'template-save-source-task')

    await page.getByRole('button', { name: 'Save as Template' }).click()
    await expect(page.getByRole('dialog', { name: 'Save as Template' })).toBeVisible()
    await page.getByLabel('Template Name').fill('Saved prompt template')
    await page.getByRole('button', { name: 'Save Template' }).click()

    await expect(page.getByRole('dialog', { name: 'Save as Template' })).not.toBeVisible()
    expect(api.createdBodies[0]).toEqual(
      expect.objectContaining({
        name: 'Saved prompt template',
        sourceAnalysisTaskId: 'template-save-source-task',
      }),
    )
    expect(String(api.createdBodies[0].content)).toContain('sunset')
  })

  test('插入变量后保存会提交识别到的变量', async ({ page }) => {
    const api = await mockTemplateApi(page)
    await reachPromptEditor(page)

    await page.getByRole('button', { name: 'Save as Template' }).click()
    await page.getByLabel('Template Name').fill('Variable template')
    await page.getByRole('button', { name: /\{\{\}\} Insert Variable/ }).click()
    await page.getByPlaceholder('Variable name').fill('subject')
    await page.getByRole('button', { name: 'Confirm' }).click()

    await expect(page.getByText(/Detected Variables/)).toBeVisible()
    await expect(page.getByLabel('Detected variable subject')).toBeVisible()
    await page.getByRole('button', { name: 'Save Template' }).click()

    await expect(page.getByRole('dialog', { name: 'Save as Template' })).not.toBeVisible()
    expect(api.createdBodies[0].variables).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'subject' })]),
    )
  })

  test('空名称展示校验错误', async ({ page }) => {
    await mockTemplateApi(page)
    await reachPromptEditor(page)

    await page.getByRole('button', { name: 'Save as Template' }).click()
    await page.getByRole('button', { name: 'Save Template' }).click()

    await expect(page.getByText('Enter a template name')).toBeVisible()
  })

  test('template with this name展示冲突错误', async ({ page }) => {
    await mockTemplateApi(page, [templateRecord({ id: 'existing-template', name: 'Duplicate name' })])
    await reachPromptEditor(page)

    await page.getByRole('button', { name: 'Save as Template' }).click()
    await page.getByLabel('Template Name').fill('Duplicate name')
    await page.getByRole('button', { name: 'Save Template' }).click()

    await expect(page.getByText('A template with this name already exists')).toBeVisible()
  })

  test('Template Library展示列表并支持搜索', async ({ page }) => {
    await mockTemplateApi(page, [
      templateRecord({ id: 'library-template-1', name: 'Editorial Glass Poster' }),
      templateRecord({ id: 'library-template-2', name: 'Soft Product Macro', variables: [] }),
    ])

    await page.goto('/workspace/templates', { waitUntil: 'commit' })

    await expect(page.getByRole('heading', { name: 'Template Library' })).toBeVisible()
    await expect(page.getByText('Editorial Glass Poster')).toBeVisible()
    await expect(page.getByText('Soft Product Macro')).toBeVisible()

    await page.getByPlaceholder('Search templates...').fill('glass')
    await expect(page.getByText('Editorial Glass Poster')).toBeVisible()
    await expect(page.getByText('Soft Product Macro')).not.toBeVisible()
  })

  test('Use Template 跳转Workspace并按默认值加载变量', async ({ page }) => {
    const template = templateRecord({ id: 'library-template-use', name: 'Default Value Template' })
    await mockTemplateApi(page, [template])

    await page.goto('/workspace/templates', { waitUntil: 'commit' })
    await page.getByRole('heading', { name: template.name }).hover()
    await page.getByRole('button', { name: 'Use Template' }).click({ force: true })

    await expect(page).toHaveURL(/\/workspace/)
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible({ timeout: 15000 })
    await expect(page.getByLabel('Variable subject')).toHaveValue('glass sculpture')
    await expect(page.getByLabel('Variable scene')).toHaveValue('white studio')
    await page.getByRole('button', { name: 'Text Mode' }).click()
    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue(
      'Create glass sculpture in white studio with hard rim light.',
    )
  })

  test('Template Library支持Duplicate模板', async ({ page }) => {
    const template = templateRecord({ id: 'library-template-copy', name: 'Copy Source Template' })
    await mockTemplateApi(page, [template])

    await page.goto('/workspace/templates', { waitUntil: 'commit' })
    await page.getByRole('heading', { name: template.name }).hover()
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('button', { name: 'Duplicate' }).click()

    await expect(page.getByText('Copy Source Template (copy)')).toBeVisible({ timeout: 5000 })
  })

  test('Template Library支持Delete模板', async ({ page }) => {
    const template = templateRecord({ id: 'library-template-delete', name: 'Delete Target Template' })
    await mockTemplateApi(page, [template])

    await page.goto('/workspace/templates', { waitUntil: 'commit' })
    await page.getByRole('heading', { name: template.name }).hover()
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByRole('alertdialog', { name: 'Confirm Delete' })).toBeVisible()
    await page.getByRole('alertdialog', { name: 'Confirm Delete' }).getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByRole('alertdialog', { name: 'Confirm Delete' })).not.toBeVisible()
    await expect(page.getByText(template.name)).not.toBeVisible({ timeout: 5000 })
  })
})
