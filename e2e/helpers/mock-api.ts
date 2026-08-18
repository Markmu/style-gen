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

/** Mock next-auth session API — reports no authenticated user (signed out).
 * Mirrors the real Auth.js session action, which responds with a `null` body
 * when no session token is present (an `{}` body would make `useSession()`
 * return a truthy object without `user` and break consumer guards). */
export async function mockLoggedOutSession(page: Page) {
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(null),
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

/** plan-04: 捕获到的主动生成请求（POST /api/generation），供恢复后再次生成断言 */
export interface CapturedGenerationCreateRequest {
  url: string
  body: Record<string, unknown>
}

/**
 * Mock POST /api/generation with request-body capture — plan-04 恢复→修改→主动生成
 * 场景：断言请求体携带恢复后的 prompt / sourceTemplateId，且恢复动作本身零 POST。
 * 仅拦截 POST（无 query）；GET 列表（带 query 的 generation 端点）继续由
 * `mockIterationList` / `mockGenerationList` 提供。
 */
export async function mockGenerationCreateCapture(
  page: Page,
  taskId = 'mock-generation-task-id',
) {
  const requests: CapturedGenerationCreateRequest[] = []
  await page.route('**/api/generation', async (route) => {
    if (route.request().method() === 'POST') {
      requests.push({
        url: route.request().url(),
        body: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
      })
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: taskId, status: 'pending' }),
      })
    } else {
      await route.continue()
    }
  })
  return { requests }
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

/** plan-02: Iteration Memory 列表条目 — GET /api/generation 条目 DTO（架构 §7.2，plan-01 交付） */
export interface MockIterationListItem {
  id: string
  status: 'processing' | 'completed' | 'failed'
  promptSummary: string
  resultFileUrl: string | null
  params: { aspectRatio: string; quality: string }
  createdAt: string
}

/** Captured query of a GET /api/generation request, for asserting q/status/cursor passthrough */
export interface IterationListRequestQuery {
  q: string | null
  status: string | null
  cursor: string | null
  pageSize: number | null
}

export interface MockIterationListOptions {
  /** Receives the parsed query of every GET /api/generation request */
  onRequest?: (query: IterationListRequestQuery) => void
}

/**
 * Mock GET /api/generation — full Iteration Memory list consumed by /workspace/iterations.
 * Mirrors the plan-01 GET contract: `status` defaults to completed (recent-strip
 * compatibility), `all` applies no status filter, `q` is a case-insensitive
 * promptSummary match, and `cursor` is the keyset id of the last item already
 * served. `pageSize` is clamped to [1, 50] with a default of 20, and
 * `nextCursor` is the last id of the served page while earlier records remain.
 */
export async function mockIterationList(
  page: Page,
  items: MockIterationListItem[],
  options: MockIterationListOptions = {},
) {
  await page.route('**/api/generation?**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    const url = new URL(route.request().url())
    const rawPageSize = url.searchParams.get('pageSize')
    const query: IterationListRequestQuery = {
      q: url.searchParams.get('q'),
      status: url.searchParams.get('status'),
      cursor: url.searchParams.get('cursor'),
      pageSize: rawPageSize === null ? null : Number(rawPageSize),
    }
    options.onRequest?.(query)

    const q = (query.q ?? '').trim().toLowerCase()
    const status = query.status ?? 'completed'

    let filtered = status === 'all' ? items : items.filter((item) => item.status === status)
    if (q) {
      filtered = filtered.filter((item) => item.promptSummary.toLowerCase().includes(q))
    }

    const cursorIndex = query.cursor
      ? filtered.findIndex((item) => item.id === query.cursor)
      : -1
    const remaining = query.cursor
      ? cursorIndex >= 0
        ? filtered.slice(cursorIndex + 1)
        : []
      : filtered

    const parsedPageSize = Number.isFinite(query.pageSize) ? Number(query.pageSize) : 20
    const pageSize = Math.max(1, Math.min(50, Math.trunc(parsedPageSize)))
    const pageItems = remaining.slice(0, pageSize)
    const nextCursor =
      remaining.length > pageItems.length && pageItems.length > 0
        ? pageItems[pageItems.length - 1].id
        : null

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: pageItems, nextCursor }),
    })
  })
}

/** plan-03: 详情 DTO 内的变量条目（对齐 `TemplateVariable`） */
export interface MockIterationDetailVariable {
  name: string;
  defaultValue: string;
  label?: string;
  sourceField?: string;
}

/**
 * plan-03: Iteration Memory 详情 — GET /api/generation/[id] DTO
 * （架构 §7.2 / §6.2，plan-01 交付）。shape 严格对齐 `src/types/models.ts`
 * 的 `IterationDetail`：processing/failed 的 resultFileUrl 为 null；来源标记
 * 字段（recipeSource/variablesSource/sourceImageUrl）直接驱动前端缺失提示。
 */
export interface MockIterationDetail {
  id: string;
  analysisTaskId: string;
  status: 'processing' | 'completed' | 'failed';
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: { aspectRatio: string; quality: string };
  modelName: string;
  resultFileUrl: string | null;
  errorMessage: string | null;
  recipe: object | null;
  recipeSource: 'snapshot' | 'fallback' | 'missing';
  variables: MockIterationDetailVariable[];
  variablesSource: 'snapshot' | 'fallback' | 'missing';
  sourceImageUrl: string | null;
  sourceAssetId: string | null;
  sourceTemplateId: string | null;
  sourceTemplateName: string | null;
  savedTemplate: { id: string; name: string } | null;
  /** 兼容字段：use-history-restore 变量回退依赖 */
  analysisTemplateVariables: MockIterationDetailVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface MockIterationDetailOptions {
  /** Receives a tick for every GET /api/generation/[id] request（轮询节奏/次数断言） */
  onRequest?: () => void;
}

/**
 * Mock GET /api/generation/[id] — Iteration Memory 全状态详情（plan-03）。
 * 单条固定响应；轮询迁移场景用 `mockIterationDetailSequence`。
 */
export async function mockIterationDetail(
  page: Page,
  detail: MockIterationDetail,
  options: MockIterationDetailOptions = {},
) {
  await page.route(`**/api/generation/${detail.id}**`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    options.onRequest?.()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(detail),
    })
  })
}

/**
 * Mock GET /api/generation/[id] 轮询序列 — responses 按请求顺序逐个返回，
 * 耗尽后保持最后一项（参照 `mockGenerationPollingSequence` 模式）。
 * 用于 processing 详情 5s 轮询原地迁移到 completed/failed 的场景。
 */
export async function mockIterationDetailSequence(
  page: Page,
  detailId: string,
  responses: MockIterationDetail[],
  options: MockIterationDetailOptions = {},
) {
  let callIndex = 0
  await page.route(`**/api/generation/${detailId}**`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    const response = responses[Math.min(callIndex, responses.length - 1)]
    callIndex++
    options.onRequest?.()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...response, id: detailId }),
    })
  })
  return {
    /** Number of detail GETs served so far */
    get callCount() {
      return callIndex
    },
  }
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

/** plan-05: 捕获到的模板创建请求（POST /api/templates），供保存为 Style Memory 断言 */
export interface CapturedTemplateCreateRequest {
  url: string
  body: Record<string, unknown>
}

/** plan-05: POST /api/templates 的 mock 响应项（201 创建 / 409 同名 / 5xx） */
export interface MockTemplateCreateResponse {
  status: number
  body: object
}

/** plan-05 保存成功时的默认 mock 模板响应（对齐 `PromptTemplate` 形态） */
const DEFAULT_TEMPLATE_CREATE_RESPONSE: MockTemplateCreateResponse = {
  status: 201,
  body: {
    id: 'mock-template-id',
    name: 'Saved from iteration',
    content: '',
    variables: [],
    sourceAssetId: null,
    sourceImageUrl: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
}

/**
 * Mock POST /api/templates with request-body capture — plan-05 保存为 Style
 * Memory 场景：断言提交体 `{ name, content, variables, sourceAssetId,
 * sourceGenerationTaskId }`，并可按序返回 201/409/5xx 响应（耗尽后保持最后
 * 一项，参照 `mockGenerationCreateCapture` / `mockAnalysisPollingSequence`
 * 模式）。仅拦截无 query 的 POST 端点；GET 列表（`/api/templates?search=…`）
 * 继续由 `mockTemplateList` / `mockTemplateCollection` 提供。
 */
export async function mockTemplateCreateCapture(
  page: Page,
  responses: MockTemplateCreateResponse[] = [DEFAULT_TEMPLATE_CREATE_RESPONSE],
) {
  const requests: CapturedTemplateCreateRequest[] = []
  let callIndex = 0
  await page.route('**/api/templates', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    requests.push({
      url: route.request().url(),
      body: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
    })
    const response = responses[Math.min(callIndex, responses.length - 1)]
    callIndex++
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    })
  })
  return { requests }
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
