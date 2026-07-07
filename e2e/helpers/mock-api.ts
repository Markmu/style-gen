import type { Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadFixture(name: string): object {
  const filePath = resolve(__dirname, '../fixtures/api-responses', name)
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

export interface MockTemplateMemoryRecord {
  id: string
  name: string
  content?: string
  variables?: Array<Record<string, unknown>>
  variableCount?: number
  sourceAssetId?: string | null
  sourceImageUrl?: string | null
  createdAt?: string
  updatedAt?: string
}

function templateListItem(template: MockTemplateMemoryRecord) {
  return {
    id: template.id,
    name: template.name,
    variableCount: template.variableCount ?? template.variables?.length ?? 0,
    sourceAssetId: template.sourceAssetId ?? null,
    sourceImageUrl: template.sourceImageUrl ?? null,
    createdAt: template.createdAt ?? '2024-01-01T00:00:00.000Z',
  }
}

function templateDetail(template: MockTemplateMemoryRecord) {
  return {
    ...templateListItem(template),
    content: template.content ?? 'Create {{subject}} from the saved style memory.',
    variables: template.variables ?? [],
    updatedAt: template.updatedAt ?? template.createdAt ?? '2024-01-01T00:00:00.000Z',
  }
}

/** Mock next-auth session API — makes useSession() return an authenticated user */
export async function mockAuthSession(
  page: Page,
  user?: { name?: string; email?: string; id?: string; image?: string }
) {
  const mockUser = {
    name: user?.name ?? 'Test User',
    email: user?.email ?? 'test@example.com',
    id: user?.id ?? 'mock-user-id',
    image: user?.image ?? null,
  }

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: mockUser,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
  })
}

/** Mock presign API — returns a fixed presigned URL and file URL */
export async function mockUploadPresign(page: Page, assetId = 'mock-asset-id') {
  await page.route('**/api/upload/presign', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          presignedUrl: 'https://r2.example.com/presigned-upload-url',
          fileUrl: `https://cdn.example.com/references/${assetId}/original.png`,
          assetId,
        }),
      })
    } else {
      await route.continue()
    }
  })

  // Mock the R2 PUT upload
  await page.route('https://r2.example.com/**', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 200, body: '' })
    } else {
      await route.continue()
    }
  })
}

/** Mock analysis POST — returns a task in pending state */
export async function mockAnalysisCreate(
  page: Page,
  taskId = 'mock-analysis-task-id',
) {
  await page.route('**/api/analysis', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: taskId,
          status: 'pending',
          sourceAssetId: 'mock-asset-id',
          recipe: null,
          promptText: null,
          negativePromptText: null,
          rawResponse: null,
          errorMessage: null,
          errorStage: null,
        }),
      })
    } else {
      await route.continue()
    }
  })
}

/** Mock analysis polling GET — returns a fixed response */
export async function mockAnalysisPolling(
  page: Page,
  taskId: string,
  response: object,
) {
  await page.route(`**/api/analysis/${taskId}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...response, id: taskId }),
    })
  })
}

/** Mock analysis polling GET with sequence of responses */
export async function mockAnalysisPollingSequence(
  page: Page,
  taskId: string,
  responses: object[],
) {
  let callIndex = 0
  await page.route(`**/api/analysis/${taskId}**`, async (route) => {
    const response = responses[Math.min(callIndex, responses.length - 1)]
    callIndex++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...response, id: taskId }),
    })
  })
}

/** Mock generation POST — returns task in pending state */
export async function mockGenerationCreate(
  page: Page,
  taskId = 'mock-generation-task-id',
) {
  await page.route('**/api/generation', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: taskId, status: 'pending' }),
      })
    } else {
      await route.continue()
    }
  })
}

/** Mock generation polling GET — returns a fixed response */
export async function mockGenerationPolling(
  page: Page,
  taskId: string,
  response: object,
) {
  await page.route(`**/api/generation/${taskId}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...response, id: taskId }),
    })
  })
}

/** Mock generation polling GET with sequence of responses */
export async function mockGenerationPollingSequence(
  page: Page,
  taskId: string,
  responses: object[],
) {
  let callIndex = 0
  await page.route(`**/api/generation/${taskId}**`, async (route) => {
    const response = responses[Math.min(callIndex, responses.length - 1)]
    callIndex++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...response, id: taskId }),
    })
  })
}

/** Mock generation history GET — recent iterations list */
export async function mockGenerationList(
  page: Page,
  items: object[] = [],
  nextCursor: string | null = null,
) {
  await page.route('**/api/generation?**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items, nextCursor }),
      })
    } else {
      await route.continue()
    }
  })
}

/** Mock generation history GET with a sequence of list responses */
export async function mockGenerationListSequence(
  page: Page,
  responses: Array<{ items?: object[]; nextCursor?: string | null }>,
) {
  let callIndex = 0
  await page.route('**/api/generation?**', async (route) => {
    if (route.request().method() === 'GET') {
      const response = responses[Math.min(callIndex, responses.length - 1)] ?? {}
      callIndex++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: response.items ?? [],
          nextCursor: response.nextCursor ?? null,
        }),
      })
    } else {
      await route.continue()
    }
  })
}

/** Mock generation detail GET — history restore payload */
export async function mockGenerationDetail(
  page: Page,
  generationId: string,
  detail: object,
) {
  await page.route(`**/api/generation/${generationId}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...detail, id: generationId }),
      })
    } else {
      await route.continue()
    }
  })
}

/** Mock template list GET — Style Memory list */
export async function mockTemplateList(
  page: Page,
  items: object[] = [],
  nextCursor: string | null = null,
) {
  await page.route('**/api/templates?**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          hasMore: Boolean(nextCursor),
          nextCursor,
        }),
      })
    } else {
      await route.continue()
    }
  })
}

/** Mock template create POST — Save as Style Memory */
export async function mockTemplateCreate(
  page: Page,
  onBody?: (body: Record<string, unknown>) => void,
  response: object = {},
) {
  await page.route('**/api/templates', async (route) => {
    if (route.request().method() === 'POST') {
      onBody?.(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-template-id',
          name: 'Restored memory',
          content: 'Restored prompt',
          variables: [],
          sourceAssetId: null,
          sourceImageUrl: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          ...response,
        }),
      })
    } else {
      await route.continue()
    }
  })
}

/** Mock template collection API — Style Memory list/detail/use/duplicate/delete */
export async function mockTemplateCollection(
  page: Page,
  initialTemplates: MockTemplateMemoryRecord[] = [],
) {
  const templates = [...initialTemplates]
  const duplicateRequests: string[] = []
  const deleteRequests: string[] = []
  const createRequests: Record<string, unknown>[] = []

  await page.route('**/api/templates**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const method = request.method()

    if (pathname === '/api/templates' && method === 'GET') {
      const search = url.searchParams.get('search')?.trim().toLowerCase() ?? ''
      const filtered = search
        ? templates.filter((template) =>
            [template.name, template.content ?? ''].some((value) =>
              value.toLowerCase().includes(search),
            ),
          )
        : templates

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: filtered.map(templateListItem),
          hasMore: false,
          nextCursor: null,
        }),
      })
      return
    }

    if (pathname === '/api/templates' && method === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>
      createRequests.push(body)
      const created = {
        id: `mock-template-${templates.length + 1}`,
        name: String(body.name ?? 'Untitled memory'),
        content: String(body.content ?? ''),
        variables: Array.isArray(body.variables)
          ? (body.variables as Array<Record<string, unknown>>)
          : [],
        sourceAssetId:
          typeof body.sourceAssetId === 'string' ? body.sourceAssetId : null,
        sourceImageUrl:
          typeof body.sourceImageUrl === 'string' ? body.sourceImageUrl : null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }
      templates.unshift(created)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(templateDetail(created)),
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

      duplicateRequests.push(source.id)
      const copy = {
        ...source,
        id: `${source.id}-copy`,
        name: `${source.name} Copy`,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }
      templates.unshift(copy)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(templateDetail(copy)),
      })
      return
    }

    const detailMatch = pathname.match(/^\/api\/templates\/([^/]+)$/)
    if (detailMatch && method === 'GET') {
      const template = templates.find((item) => item.id === detailMatch[1])
      await route.fulfill({
        status: template ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(template ? templateDetail(template) : { error: 'Template not found' }),
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

      deleteRequests.push(templates[index].id)
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

  return { templates, duplicateRequests, deleteRequests, createRequests }
}

/** Mock API error response */
export async function mockApiError(
  page: Page,
  urlPattern: string,
  status: number,
  body: object,
  headers?: Record<string, string>,
) {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
      headers,
    })
  })
}

/** Load fixture data */
export { loadFixture }
