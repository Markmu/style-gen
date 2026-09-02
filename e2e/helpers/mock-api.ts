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

/**
 * Mock analysis POST with a sequence of task ids — 第 15 期 plan-02 TC-2.10
 * 「分析失败后重试」场景：真实后端每次 POST 都创建新任务，mock 依次返回
 * `taskIds` 中的 id（耗尽后保持最后一项），驱动重试轮询走新 query key。
 */
export async function mockAnalysisCreateSequence(
  page: Page,
  taskIds: string[],
) {
  let callIndex = 0
  await page.route('**/api/analysis', async (route) => {
    if (route.request().method() === 'POST') {
      const taskId = taskIds[Math.min(callIndex, taskIds.length - 1)]
      callIndex++
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

/** plan-06: 捕获到的分析创建请求（POST /api/analysis），供「结果作为新参考」断言 */
export interface CapturedAnalysisCreateRequest {
  url: string
  body: Record<string, unknown>
}

/**
 * Mock POST /api/analysis with request-body capture — 第 15 期 plan-06
 * 「结果作为新参考」场景：断言已有资产分析分支只提交 `{sourceAssetId}`
 * （ADR-6：不下载/重传/复制 Asset，服务端绝不接受客户端 fileUrl/尺寸/MIME）。
 * 每次 POST 返回 `taskId` 的 pending 任务；仅拦截 POST，GET 轮询继续由
 * `mockAnalysisPolling` 提供。在既有 `mockAnalysisCreate` 之后注册即可只捕获
 * 后续新请求（Playwright route 后注册优先），与 `mockGenerationCreateCapture`
 * 口径一致。
 */
export async function mockAnalysisCreateCapture(
  page: Page,
  taskId = 'mock-analysis-task-id',
) {
  const requests: CapturedAnalysisCreateRequest[] = []
  await page.route('**/api/analysis', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    requests.push({
      url: route.request().url(),
      body: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
    })
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
  })
  return { requests }
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

/** plan-07: POST /api/generation 序列步——成功步（201 + taskId）或错误步（>=400 + body） */
export interface MockGenerationCreateStep {
  /** 错误步的 HTTP 状态码（>=400 时按错误响应返回；缺省视为成功步） */
  status?: number
  /** 错误步响应体 */
  body?: Record<string, unknown>
  /** 成功步返回的任务 id（默认 'mock-generation-task-id'） */
  taskId?: string
}

/**
 * Mock POST /api/generation with per-request response steps — 第 15 期 plan-07
 * 全旅程 / L5 降级场景：第 n 次提交返回 steps[n]（越界沿用最后一步），
 * 并捕获全部请求体（与 `mockGenerationCreateCapture` 同构）。
 * 成功步返回 201 `{id, status:'pending'}`；错误步返回给定 status/body
 * （驱动「提交失败内联呈现、主动重试创建新任务」的序列）。
 * 仅拦截 POST；GET 列表/详情继续由其余 generation mock 提供。
 */
export async function mockGenerationCreateSequence(
  page: Page,
  steps: MockGenerationCreateStep[],
) {
  const requests: CapturedGenerationCreateRequest[] = []
  let callIndex = 0
  await page.route('**/api/generation', async (route) => {
    if (route.request().method() === 'POST') {
      requests.push({
        url: route.request().url(),
        body: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
      })
      const step = steps[Math.min(callIndex, steps.length - 1)] ?? {}
      callIndex++
      if ((step.status ?? 201) >= 400) {
        await route.fulfill({
          status: step.status ?? 500,
          contentType: 'application/json',
          body: JSON.stringify(step.body ?? { error: 'Generation service error' }),
        })
        return
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: step.taskId ?? 'mock-generation-task-id',
          status: 'pending',
        }),
      })
      return
    }
    await route.continue()
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
  /**
   * 第 15 期 plan-03/plan-05: 提交时固化的 Prompt 控制快照；旧任务为 null。
   * 可选字段：既有 spec 构造的详情对象不受影响（真实 DTO 始终携带该键）。
   */
  promptControlSnapshot?: Record<string, unknown> | null;
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

/**
 * Mock POST /api/templates with a delayed single response — plan-06 保存进行中
 * 锁定场景：响应延迟 `delayMs` 才返回，供"保存进行中按钮锁定、连点只发一次
 * POST"断言。仅拦截无 query 的 POST；其余方法放行。请求捕获口径同
 * `mockTemplateCreateCapture`。
 */
export async function mockTemplateCreateCaptureSlow(
  page: Page,
  response: MockTemplateCreateResponse,
  delayMs = 2000,
) {
  const requests: CapturedTemplateCreateRequest[] = []
  await page.route('**/api/templates', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    requests.push({
      url: route.request().url(),
      body: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
    })
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    })
  })
  return { requests }
}

/** plan-04: Style Memory 列表条目 — GET /api/templates 新 DTO（plan-02 交付，`StyleMemoryListItem`） */
export interface MockStyleMemoryListItem {
  id: string
  name: string
  verificationStatus: 'user_verified' | 'pending_verification'
  /** 服务端已取前 2 条的规则摘要 */
  retainedRulesPreview: string[]
  variableCount: number
  /** 来源图（pending 卡主预览 / verified 卡次预览） */
  sourceImageUrl: string | null
  /** 代表结果图（已验证主预览） */
  representativeImageUrl: string | null
  /** ISO 8601，无使用为 null */
  lastUsedAt: string | null
  updatedAt: string
  /** mock-only：参与 mock 搜索谓词的额外可检索文本（说明/变量名/标签等），不序列化进响应 */
  mockSearchText?: string
}

/** Captured query of a GET /api/templates list request, for asserting search/status/cursor passthrough */
export interface StyleMemoryListRequestQuery {
  search: string | null
  status: string | null
  cursor: string | null
}

export interface MockStyleMemoryListOptions {
  /** Receives the parsed query of every GET /api/templates list request */
  onRequest?: (query: StyleMemoryListRequestQuery) => void
}

/** plan-04: 剥离 mock-only 的 `mockSearchText`，得到与 GET /api/templates 响应一致的条目 DTO */
export function styleMemoryListItemDto(item: MockStyleMemoryListItem) {
  const dto = { ...item }
  delete dto.mockSearchText
  return dto
}

/**
 * Mock GET /api/templates — plan-04 Style Memory 列表（plan-02 新 DTO）。
 * `status`（all | user_verified | pending_verification）与 `search` 在 mock 侧
 * 按名称 + retainedRulesPreview + mockSearchText 跨字段过滤，模拟服务端谓词；
 * 响应序列化前剥离 mock-only 的 `mockSearchText` 字段。
 */
export async function mockStyleMemoryList(
  page: Page,
  items: MockStyleMemoryListItem[],
  options: MockStyleMemoryListOptions = {},
) {
  await page.route('**/api/templates?**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    const url = new URL(route.request().url())
    const query: StyleMemoryListRequestQuery = {
      search: url.searchParams.get('search'),
      status: url.searchParams.get('status'),
      cursor: url.searchParams.get('cursor'),
    }
    options.onRequest?.(query)

    let filtered = items
    if (query.status && query.status !== 'all') {
      filtered = filtered.filter((item) => item.verificationStatus === query.status)
    }
    const search = (query.search ?? '').trim().toLowerCase()
    if (search) {
      filtered = filtered.filter((item) =>
        [item.name, ...item.retainedRulesPreview, item.mockSearchText ?? '']
          .join(' ')
          .toLowerCase()
          .includes(search),
      )
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: filtered.map(styleMemoryListItemDto),
        hasMore: false,
        nextCursor: null,
      }),
    })
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

/** Mock CDN image requests (references/results) with a 1x1 PNG — no external network */
export async function mockCdnImages(page: Page) {
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.route('https://cdn.example.com/**', async (route) => {
    if (
      route.request().resourceType() === 'image' ||
      /\.(png|jpg|webp)$/.test(route.request().url())
    ) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: pixel })
      return
    }
    await route.continue()
  })
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

// ─── plan-05: Style Memory 详情 / 治理端点 mock（架构 §6.2 / §6.4 / §7.2 契约） ───

/** plan-05: 详情变量条目（对齐 `TemplateVariable`） */
export interface MockStyleMemoryDetailVariable {
  name: string;
  defaultValue: string;
  label?: string;
}

/**
 * plan-05: Style Memory 详情 DTO — GET /api/templates/[id] 响应
 * （架构 §7.2 `StyleMemoryDetail`：`StyleMemoryRecord` 序列化 +
 * sourceGenerationTask / representativeResult / usage 三个附加块）。
 */
export interface MockStyleMemoryDetail {
  id: string;
  name: string;
  description: string | null;
  content: string;
  variables: MockStyleMemoryDetailVariable[];
  retainedRules: string[];
  negativeConstraints: string[];
  styleTokens: string[];
  enhancementHints: string[];
  verificationStatus: 'user_verified' | 'pending_verification';
  representativeGenerationTaskId: string | null;
  sourceAssetId: string | null;
  sourceImageUrl: string | null;
  sourceGenerationTaskId: string | null;
  /** 附加块：来源 Iteration（缺失为 null） */
  sourceGenerationTask: { id: string; createdAt: string } | null;
  /** 附加块：代表结果（无引用为 null） */
  representativeResult: { iterationId: string; imageUrl: string | null; createdAt: string } | null;
  /** 附加块：使用情况聚合 */
  usage: { lastUsedAt: string | null; derivedIterationCount: number };
  createdAt: string;
  updatedAt: string;
}

/** plan-05: 代表结果候选条目 — GET /api/templates/[id]/representative-candidates 条目（架构 §7.2） */
export interface MockRepresentativeCandidate {
  /** generation task id */
  id: string;
  imageUrl: string | null;
  /** 服务端截断 120 字符口径 */
  promptSummary: string;
  createdAt: string;
}

/**
 * plan-05: 读时防御降级（plan-01 repository 同口径）：
 * user_verified 且代表结果引用为空 → 序列化为 pending_verification。
 */
function effectiveMockVerificationStatus(memory: MockStyleMemoryDetail) {
  return memory.verificationStatus === 'user_verified' &&
    memory.representativeGenerationTaskId === null
    ? 'pending_verification'
    : memory.verificationStatus;
}

/** plan-05: 详情响应序列化（补 userId，对齐 `StyleMemoryDetail`） */
export function styleMemoryDetailDto(memory: MockStyleMemoryDetail) {
  return {
    ...memory,
    verificationStatus: effectiveMockVerificationStatus(memory),
    userId: 'mock-user-id',
  };
}

/** plan-05: 扁平 record 序列化（PUT / duplicate / representative-result 响应，对齐 `StyleMemoryRecord`） */
function styleMemoryRecordDto(memory: MockStyleMemoryDetail) {
  return {
    id: memory.id,
    name: memory.name,
    description: memory.description,
    content: memory.content,
    variables: memory.variables,
    retainedRules: memory.retainedRules,
    negativeConstraints: memory.negativeConstraints,
    styleTokens: memory.styleTokens,
    enhancementHints: memory.enhancementHints,
    verificationStatus: effectiveMockVerificationStatus(memory),
    representativeGenerationTaskId: memory.representativeGenerationTaskId,
    sourceAssetId: memory.sourceAssetId,
    sourceImageUrl: memory.sourceImageUrl,
    sourceGenerationTaskId: memory.sourceGenerationTaskId,
    userId: 'mock-user-id',
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

/**
 * plan-05: 规则集合实质变化判定（`src/lib/style-memory-rules.ts` 同口径的
 * mock 内联实现：trim → 过滤空串 → 字典序排序 → 逐元素比较；顺序/空白差异不算）。
 */
function mockRuleSetsChanged(previous: string[], next: string[]): boolean {
  const normalize = (rules: string[]) =>
    rules
      .map((rule) => rule.trim())
      .filter((rule) => rule.length > 0)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const normalizedPrevious = normalize(previous);
  const normalizedNext = normalize(next);
  return (
    normalizedPrevious.length !== normalizedNext.length ||
    normalizedPrevious.some((rule, index) => rule !== normalizedNext[index])
  );
}

/** Mock GET /api/templates/[id] — 单条固定详情响应（AC-03 / AC-09 展示场景） */
export async function mockStyleMemoryDetail(
  page: Page,
  detail: MockStyleMemoryDetail,
) {
  await page.route(`**/api/templates/${detail.id}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(styleMemoryDetailDto(detail)),
    });
  });
}

/**
 * Mock GET /api/templates/[id] 重试序列 — 前 `failuresBeforeSuccess` 次
 * 返回 503（retryable），之后返回 200 详情（AC-10 详情错误态 + 重试恢复）。
 */
export async function mockStyleMemoryDetailRetrySequence(
  page: Page,
  detail: MockStyleMemoryDetail,
  failuresBeforeSuccess = 1,
) {
  let callCount = 0;
  await page.route(`**/api/templates/${detail.id}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    callCount++;
    if (callCount <= failuresBeforeSuccess) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Style Memory service temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
          retryable: true,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(styleMemoryDetailDto(detail)),
    });
  });
  return {
    get callCount() {
      return callCount;
    },
  };
}

/** plan-05: 捕获到的 PUT /api/templates/[id] 请求（五字段编辑断言） */
export interface CapturedStyleMemoryPutRequest {
  id: string;
  body: Record<string, unknown>;
}

/** plan-05: 捕获到的 POST representative-result 请求（选择/替换代表结果断言） */
export interface CapturedRepresentativeResultRequest {
  id: string;
  body: Record<string, unknown>;
}

/** plan-05: GET representative-candidates 的请求 query（游标分页断言） */
export interface RepresentativeCandidateRequestQuery {
  id: string;
  cursor: string | null;
  limit: number | null;
}

export interface MockStyleMemoryDetailCollectionOptions {
  /** 按 memory id 提供代表结果候选（createdAt DESC / id DESC 双键分页） */
  candidates?: Record<string, MockRepresentativeCandidate[]>;
  /** 候选分页固定页大小（默认 20；设小值驱动「Load earlier」游标翻页） */
  candidatePageSize?: number;
}

/**
 * Mock /api/templates** — plan-05 有状态详情集合（编辑回退 / 复制 / 删除 /
 * 代表结果 / 候选游标 + 列表 GET）。行为对齐 plan-02 真实端点：
 *
 * - GET `[id]` → StyleMemoryDetail（防御降级同口径）；不存在 → 404 TEMPLATE_NOT_FOUND
 * - PUT `[id]` → 五字段合并；规则集合实质变化 → 回退 pending_verification（ADR-1）；
 *   响应为扁平 record（真实端点不返回 detail 附加块）
 * - DELETE `[id]` → 204；POST `[id]/duplicate` → 201，副本 ` (copy)` + pending +
 *   无代表结果 + usage 清零（来源链保留）
 * - POST `[id]/representative-result {generationTaskId}` → record（user_verified，
 *   imageUrl 取自候选集）
 * - GET `[id]/representative-candidates?cursor&limit` → `{items, hasMore, nextCursor}`
 *   （游标 `ISO 8601 日期::id` 编码，与 repository 口径一致）
 * - GET `/api/templates?search&status` → 列表（search/status mock 谓词同 `mockStyleMemoryList`）
 */
export async function mockStyleMemoryDetailCollection(
  page: Page,
  records: MockStyleMemoryDetail[],
  options: MockStyleMemoryDetailCollectionOptions = {},
) {
  const memories: MockStyleMemoryDetail[] = structuredClone(records);
  const putRequests: CapturedStyleMemoryPutRequest[] = [];
  const deleteRequests: string[] = [];
  const duplicateRequests: string[] = [];
  const representativeResultRequests: CapturedRepresentativeResultRequest[] = [];
  const candidateQueries: RepresentativeCandidateRequestQuery[] = [];
  /**
   * plan-06: 已发生的列表 GET（search/status query 快照）——统一刷新协调器
   * 「templates 列表前缀回读」的计数断言。
   */
  const listQueries: Array<{ search: string | null; status: string | null }> = [];
  /** plan-06: 已发生的详情 GET（memory id 序列）——「style-memory-detail/{id} 回读」的计数断言 */
  const detailGets: string[] = [];
  const candidatePageSize = options.candidatePageSize ?? 20;

  const find = (id: string) => memories.find((memory) => memory.id === id);

  await page.route('**/api/templates**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    // 列表 GET（删除确认后回列表 / 复制品列表断言）
    if (pathname === '/api/templates' && method === 'GET') {
      const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
      const status = url.searchParams.get('status');
      listQueries.push({ search: url.searchParams.get('search'), status });
      let filtered = memories;
      if (status && status !== 'all') {
        filtered = filtered.filter(
          (memory) => effectiveMockVerificationStatus(memory) === status,
        );
      }
      if (search) {
        filtered = filtered.filter((memory) =>
          [memory.name, memory.description ?? '', ...memory.retainedRules, ...memory.styleTokens]
            .join(' ')
            .toLowerCase()
            .includes(search),
        );
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: filtered.map((memory) => ({
            id: memory.id,
            name: memory.name,
            verificationStatus: effectiveMockVerificationStatus(memory),
            retainedRulesPreview: memory.retainedRules.slice(0, 2),
            variableCount: memory.variables.length,
            sourceImageUrl: memory.sourceImageUrl,
            representativeImageUrl: memory.representativeResult?.imageUrl ?? null,
            lastUsedAt: memory.usage.lastUsedAt,
            updatedAt: memory.updatedAt,
          })),
          hasMore: false,
          nextCursor: null,
        }),
      });
      return;
    }

    // 代表结果候选 GET（游标分页）
    const candidatesMatch = pathname.match(
      /^\/api\/templates\/([^/]+)\/representative-candidates$/,
    );
    if (candidatesMatch && method === 'GET') {
      const id = candidatesMatch[1];
      const memory = find(id);
      if (!memory) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND', retryable: false }),
        });
        return;
      }
      const cursor = url.searchParams.get('cursor');
      const limitRaw = url.searchParams.get('limit');
      candidateQueries.push({
        id,
        cursor,
        limit: limitRaw === null ? null : Number(limitRaw),
      });

      const all = [...(options.candidates?.[id] ?? [])].sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
      let start = 0;
      if (cursor) {
        const separatorIndex = cursor.lastIndexOf('::');
        const cursorId = cursor.slice(separatorIndex + 2);
        const index = all.findIndex((candidate) => candidate.id === cursorId);
        start = index >= 0 ? index + 1 : all.length;
      }
      const items = all.slice(start, start + candidatePageSize);
      const hasMore = start + candidatePageSize < all.length;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          hasMore,
          nextCursor:
            hasMore && items.length > 0
              ? `${items[items.length - 1].createdAt}::${items[items.length - 1].id}`
              : null,
        }),
      });
      return;
    }

    // 设置/替换代表结果 POST
    const setResultMatch = pathname.match(
      /^\/api\/templates\/([^/]+)\/representative-result$/,
    );
    if (setResultMatch && method === 'POST') {
      const id = setResultMatch[1];
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      representativeResultRequests.push({ id, body });
      const memory = find(id);
      if (!memory) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND', retryable: false }),
        });
        return;
      }
      const generationTaskId = String(body.generationTaskId ?? '');
      const candidate = (options.candidates?.[id] ?? []).find(
        (item) => item.id === generationTaskId,
      );
      memory.representativeGenerationTaskId = generationTaskId || null;
      memory.verificationStatus = 'user_verified';
      memory.representativeResult = {
        iterationId: generationTaskId,
        imageUrl: candidate?.imageUrl ?? null,
        createdAt: candidate?.createdAt ?? new Date().toISOString(),
      };
      memory.updatedAt = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(styleMemoryRecordDto(memory)),
      });
      return;
    }

    // 复制 POST
    const duplicateMatch = pathname.match(/^\/api\/templates\/([^/]+)\/duplicate$/);
    if (duplicateMatch && method === 'POST') {
      const source = find(duplicateMatch[1]);
      if (!source) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND', retryable: false }),
        });
        return;
      }
      duplicateRequests.push(source.id);
      const copy = structuredClone(source);
      copy.id = `${source.id}-copy`;
      copy.name = `${source.name} (copy)`;
      copy.verificationStatus = 'pending_verification';
      copy.representativeGenerationTaskId = null;
      copy.representativeResult = null;
      copy.usage = { lastUsedAt: null, derivedIterationCount: 0 };
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      memories.unshift(copy);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(styleMemoryRecordDto(copy)),
      });
      return;
    }

    // 详情 GET / PUT / DELETE
    const detailMatch = pathname.match(/^\/api\/templates\/([^/]+)$/);
    if (detailMatch) {
      const id = detailMatch[1];
      const memory = find(id);

      if (method === 'GET') {
        if (!memory) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND', retryable: false }),
          });
          return;
        }
        detailGets.push(id);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(styleMemoryDetailDto(memory)),
        });
        return;
      }

      if (method === 'PUT') {
        const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
        putRequests.push({ id, body });
        if (!memory) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND', retryable: false }),
          });
          return;
        }
        // 规则集合实质变化 → 服务端回退 pending_verification（ADR-1 服务端派生）
        const nextRules = Array.isArray(body.retainedRules)
          ? (body.retainedRules as string[])
          : memory.retainedRules;
        const nextConstraints = Array.isArray(body.negativeConstraints)
          ? (body.negativeConstraints as string[])
          : memory.negativeConstraints;
        if (
          mockRuleSetsChanged(memory.retainedRules, nextRules) ||
          mockRuleSetsChanged(memory.negativeConstraints, nextConstraints)
        ) {
          memory.verificationStatus = 'pending_verification';
        }
        if (typeof body.name === 'string' && body.name) {
          memory.name = body.name;
        }
        if (body.description !== undefined) {
          memory.description =
            typeof body.description === 'string' && body.description.trim()
              ? body.description
              : null;
        }
        if (Array.isArray(body.variables)) {
          memory.variables = body.variables as MockStyleMemoryDetailVariable[];
        }
        if (Array.isArray(body.retainedRules)) {
          memory.retainedRules = nextRules;
        }
        if (Array.isArray(body.negativeConstraints)) {
          memory.negativeConstraints = nextConstraints;
        }
        if (typeof body.content === 'string' && body.content) {
          memory.content = body.content;
        }
        memory.updatedAt = new Date().toISOString();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(styleMemoryRecordDto(memory)),
        });
        return;
      }

      if (method === 'DELETE') {
        if (!memory) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Template not found', code: 'TEMPLATE_NOT_FOUND', retryable: false }),
          });
          return;
        }
        deleteRequests.push(memory.id);
        memories.splice(memories.indexOf(memory), 1);
        await route.fulfill({ status: 204, body: '' });
        return;
      }
    }

    await route.fallback();
  });

  return {
    memories,
    putRequests,
    deleteRequests,
    duplicateRequests,
    representativeResultRequests,
    candidateQueries,
    listQueries,
    detailGets,
  };
}

// ─── 第 15 期 plan-05：方向结果 feed / 比较详情 mock（架构 §6.4 / §6.5 / §7.2 契约） ───

/** 第 15 期 plan-05: 方向结果条目 — GET /api/generation?view=direction 条目（DirectionIterationListItem） */
export interface MockDirectionFeedItem {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** 服务端截断 120 字符口径 */
  promptSummary: string;
  resultFileUrl: string | null;
  params: { aspectRatio: string; quality: string };
  /** ISO 8601（服务端按 createdAt/id 倒序返回） */
  createdAt: string;
  resultAssetId: string | null;
  errorMessage: string | null;
}

/** 第 15 期 plan-05: 方向分组 feed — DirectionIterationFeed（ADR-5：三组不共享名额） */
export interface MockDirectionFeed {
  /** 最多 5 条成功结果（服务端 pageSize 契约） */
  completed: MockDirectionFeedItem[];
  /** 最近 pending/processing（真实状态值透传，前端归并展示 processing） */
  active: MockDirectionFeedItem | null;
  /** 最近 failed */
  latestFailure: MockDirectionFeedItem | null;
}

/** 第 15 期 plan-05: 捕获到的 direction GET query（view/analysisTaskId/pageSize 契约断言） */
export interface DirectionFeedRequestQuery {
  view: string | null;
  analysisTaskId: string | null;
  pageSize: number | null;
}

export interface MockDirectionFeedOptions {
  /** Receives the parsed query of every direction GET /api/generation request */
  onRequest?: (query: DirectionFeedRequestQuery) => void;
}

/** 第 15 期 plan-05: 方向 feed 错误响应（L2：列表失败保留 previous data） */
export interface MockDirectionFeedError {
  status: number;
  body: Record<string, unknown>;
}

const DEFAULT_DIRECTION_FEED_ERROR: MockDirectionFeedError = {
  status: 503,
  body: {
    error: 'Direction feed temporarily unavailable',
    code: 'SERVICE_UNAVAILABLE',
    retryable: true,
  },
};

/**
 * Mock GET /api/generation?view=direction — 第 15 期 plan-05 可控状态方向 feed。
 *
 * 每次方向 GET 返回当前 feed 状态；测试通过 `set(feed)` 推进服务端事实
 * （如 active→completed 终态迁移），通过 `fail()` 进入 L2 错误、`set()` 恢复，
 * 不依赖请求次数敏感的序列 mock（真实后端状态在源头变化，而非按请求序变化）。
 *
 * 仅拦截 `view=direction` 的 GET；普通列表 GET（无 view）fallback 给先注册的
 * `mockGenerationList` / `mockIterationList`（后注册的 route 优先，fallback 逐级下放）。
 */
export async function mockDirectionFeedStateful(
  page: Page,
  initial: MockDirectionFeed,
  options: MockDirectionFeedOptions = {},
) {
  let current:
    | { kind: 'ok'; feed: MockDirectionFeed }
    | { kind: 'error'; error: MockDirectionFeedError } = { kind: 'ok', feed: initial };

  await page.route('**/api/generation?**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    if (url.searchParams.get('view') !== 'direction') {
      await route.fallback();
      return;
    }

    const rawPageSize = url.searchParams.get('pageSize');
    const query: DirectionFeedRequestQuery = {
      view: url.searchParams.get('view'),
      analysisTaskId: url.searchParams.get('analysisTaskId'),
      pageSize: rawPageSize === null ? null : Number(rawPageSize),
    };
    options.onRequest?.(query);

    if (current.kind === 'error') {
      await route.fulfill({
        status: current.error.status,
        contentType: 'application/json',
        body: JSON.stringify(current.error.body),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(current.feed),
    });
  });

  return {
    /** 推进服务端事实：切换 feed 并清除错误态 */
    set(feed: MockDirectionFeed) {
      current = { kind: 'ok', feed };
    },
    /** 进入 L2 错误态：后续方向 GET 全部返回该错误（直到下一次 set） */
    fail(error: MockDirectionFeedError = DEFAULT_DIRECTION_FEED_ERROR) {
      current = { kind: 'error', error };
    },
  };
}

/**
 * Mock GET /api/generation/[id] 可控状态详情 — 第 15 期 plan-05 比较详情失败/恢复
 * 场景：`fail()` 后所有详情 GET 返回 503（retryable），`set(detail)` 恢复 200。
 * 仅拦截该 id 的 GET；其余方法 fallback。
 */
export async function mockIterationDetailStateful(
  page: Page,
  detail: MockIterationDetail,
) {
  let current:
    | { kind: 'ok'; detail: MockIterationDetail }
    | { kind: 'error'; error: MockDirectionFeedError } = { kind: 'ok', detail };

  await page.route(`**/api/generation/${detail.id}**`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    if (current.kind === 'error') {
      await route.fulfill({
        status: current.error.status,
        contentType: 'application/json',
        body: JSON.stringify(current.error.body),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(current.detail),
    });
  });

  return {
    /** 后续详情 GET 返回 503（retryable），驱动比较详情错误态 */
    fail() {
      current = { kind: 'error', error: DEFAULT_DIRECTION_FEED_ERROR };
    },
    /** 恢复 200 详情（重试成功路径） */
    set(next: MockIterationDetail) {
      current = { kind: 'ok', detail: next };
    },
  };
}

/** Load fixture data */
export { loadFixture }
