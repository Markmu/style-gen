import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  mockApiError,
  mockAuthSession,
  mockGenerationList,
  mockStyleMemoryList,
  styleMemoryListItemDto,
  type MockStyleMemoryListItem,
  type StyleMemoryListRequestQuery,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'

// plan-04: Style Memory 列表页（AC-01 / AC-02 / AC-08 / AC-10 + 导航术语）
// 后端 plan-02 新 DTO 已就绪；本 spec 为 red 先行，驱动列表页/卡片/筛选/导航实现。

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const VERIFIED_MEMORY: MockStyleMemoryListItem = {
  id: 'style-memory-verified-editorial',
  name: 'Editorial Soft Daylight',
  verificationStatus: 'user_verified',
  retainedRulesPreview: ['低饱和暖灰基调', '柔和漫射光并保留细颗粒质感'],
  variableCount: 6,
  sourceImageUrl: 'https://cdn.example.com/references/verified-source/original.webp',
  representativeImageUrl: 'https://cdn.example.com/results/verified-representative.webp',
  lastUsedAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
  // 说明 / 变量名 / 排除约束等 mock 侧可检索文本（模拟服务端跨字段检索，不进响应）
  mockSearchText: 'subject scene 排除高饱和霓虹色 glass editorial poster',
}

const PENDING_SOURCE_MEMORY: MockStyleMemoryListItem = {
  id: 'style-memory-pending-macro',
  name: 'Macro Paper Texture',
  verificationStatus: 'pending_verification',
  retainedRulesPreview: ['编辑式构图并保留大面积留白', '纸张纹理与哑光表面'],
  variableCount: 4,
  sourceImageUrl: 'https://cdn.example.com/references/pending-source/original.webp',
  representativeImageUrl: null,
  lastUsedAt: null,
  updatedAt: '2026-08-24T00:00:00.000Z',
  mockSearchText: 'packDistance 编辑式构图 macro paper texture',
}

const PENDING_TEXT_ONLY_MEMORY: MockStyleMemoryListItem = {
  id: 'style-memory-pending-text-only',
  name: 'Prompt Structure Draft',
  verificationStatus: 'pending_verification',
  retainedRulesPreview: ['硬光轮廓与高对比'],
  variableCount: 2,
  sourceImageUrl: null,
  representativeImageUrl: null,
  lastUsedAt: null,
  updatedAt: '2026-08-23T00:00:00.000Z',
  mockSearchText: 'outline 硬光轮廓 prompt structure draft',
}

// 服务端按 COALESCE(last_used, updated_at) DESC 返回（最近使用排序），mock 保持给定顺序
const ALL_MEMORIES: MockStyleMemoryListItem[] = [
  VERIFIED_MEMORY,
  PENDING_SOURCE_MEMORY,
  PENDING_TEXT_ONLY_MEMORY,
]

async function mockCdnImages(page: Page) {
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
}

async function openStyleMemoryList(page: Page, path = '/workspace/templates') {
  try {
    await page.goto(path, { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }

  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
}

/** 「查看详情」入口（链接或按钮均可，路由到 /workspace/templates/{id}） */
function viewDetailEntry(card: Locator) {
  return card
    .getByRole('link', { name: '查看详情' })
    .or(card.getByRole('button', { name: '查看详情' }))
}

test.describe('plan-04 Style Memory 列表页', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  // ─── AC-01 卡片语义 ───

  test('TC-1.1 已验证卡显示代表结果主预览与真实规则摘要，待验证卡只用来源图且无名称派生标签', async ({
    page,
  }) => {
    await mockStyleMemoryList(page, ALL_MEMORIES)

    await openStyleMemoryList(page)

    const cards = page.getByTestId('style-memory-card')
    await expect(cards).toHaveCount(3, { timeout: 15000 })

    // 已验证卡：状态徽标（文字）+ 真实规则摘要 + 变量数 + 最近使用信息
    const verifiedCard = cards.nth(0)
    await expect(verifiedCard.getByText('用户已验证')).toBeVisible()
    await expect(verifiedCard.getByText('待验证')).toHaveCount(0)
    await expect(verifiedCard.getByText('低饱和暖灰基调')).toBeVisible()
    await expect(verifiedCard.getByText('柔和漫射光并保留细颗粒质感')).toBeVisible()
    await expect(verifiedCard.getByText('6 个变量')).toBeVisible()
    await expect(verifiedCard.getByText('尚未使用')).toHaveCount(0)

    // 已验证卡：代表结果为主预览 + 来源图小图并带「参考图」标注
    const representativeImg = verifiedCard.locator('img[src*="results/verified-representative"]')
    const referenceImg = verifiedCard.locator('img[src*="references/verified-source"]')
    await expect(representativeImg).toBeVisible()
    await expect(referenceImg).toBeVisible()
    await expect(verifiedCard.getByText('参考图')).toBeVisible()
    const [representativeBox, referenceBox] = await Promise.all([
      representativeImg.boundingBox(),
      referenceImg.boundingBox(),
    ])
    expect((representativeBox?.width ?? 0) * (representativeBox?.height ?? 0)).toBeGreaterThan(
      (referenceBox?.width ?? 0) * (referenceBox?.height ?? 0),
    )

    // 待验证卡（有来源图）：徽标 + 来源图主预览，不出现代表结果图与成功语气
    const pendingCard = cards.nth(1)
    await expect(pendingCard.getByText('待验证')).toBeVisible()
    await expect(pendingCard.getByText('用户已验证')).toHaveCount(0)
    await expect(pendingCard.locator('img[src*="references/pending-source"]')).toBeVisible()
    await expect(pendingCard.locator('img[src*="results/"]')).toHaveCount(0)
    await expect(pendingCard.getByText('编辑式构图并保留大面积留白')).toBeVisible()
    await expect(pendingCard.getByText('4 个变量')).toBeVisible()
    await expect(pendingCard.getByText('尚未使用')).toBeVisible()

    // 待验证卡（无来源图）：「无预览」占位，不渲染任何图片
    const textOnlyCard = cards.nth(2)
    await expect(textOnlyCard.getByText('待验证')).toBeVisible()
    await expect(textOnlyCard.getByText('无预览')).toBeVisible()
    await expect(textOnlyCard.locator('img')).toHaveCount(0)

    // 名称派生标签全部移除（NAME_TAG_RULES / Source-backed / Prompt-only 等）
    await expect(
      page.getByText(/Source-backed|Prompt-only|Variable structure|Fixed prompt/i),
    ).toHaveCount(0)

    // 卡片动作只有「查看详情 / 使用」，治理动作（更多/复制/删除）不在卡片上
    await expect(verifiedCard.getByRole('button', { name: '使用' })).toBeVisible()
    await expect(viewDetailEntry(verifiedCard)).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: /more actions|更多操作|duplicate|复制|delete|删除|edit|编辑/i,
      }),
    ).toHaveCount(0)
  })

  test('TC-1.2 加载期间显示骨架且不出现虚假卡片资产，就绪后骨架消失', async ({ page }) => {
    // 用 gate 挂起列表响应：先观察到骨架，再放行响应
    let releaseList: (() => void) | undefined
    const listGate = new Promise<void>((resolve) => {
      releaseList = resolve
    })
    await page.route('**/api/templates?**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await listGate
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [styleMemoryListItemDto(VERIFIED_MEMORY)],
          hasMore: false,
          nextCursor: null,
        }),
      })
    })

    await openStyleMemoryList(page)

    const skeleton = page.getByTestId('style-memory-card-skeleton')
    await expect(skeleton.first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('style-memory-card')).toHaveCount(0)

    releaseList?.()

    await expect(skeleton).toHaveCount(0)
    await expect(page.getByTestId('style-memory-card').first()).toBeVisible()
    await expect(page.getByText(VERIFIED_MEMORY.name)).toBeVisible()
  })

  // ─── AC-02 搜索 / 筛选 / URL 条件持久化 ───

  test('TC-2.1 按风格规则词搜索命中：请求携带 search、URL 持久化、结果与可见信息一致', async ({
    page,
  }) => {
    const queries: StyleMemoryListRequestQuery[] = []
    await mockStyleMemoryList(page, ALL_MEMORIES, {
      onRequest: (query) => queries.push(query),
    })

    await openStyleMemoryList(page)

    const searchBox = page.getByRole('textbox')
    await waitForReactInput(searchBox)
    await searchBox.fill('低饱和暖灰')

    await expect
      .poll(() => queries.some((query) => query.search === '低饱和暖灰'), { timeout: 10000 })
      .toBe(true)
    await expect(page.getByText(VERIFIED_MEMORY.name)).toBeVisible()
    await expect(page.getByText(PENDING_SOURCE_MEMORY.name)).toHaveCount(0)
    await expect(page).toHaveURL(/search=/, { timeout: 10000 })
  })

  test('TC-2.2 按变量名搜索命中：请求携带 search 并返回对应卡片', async ({ page }) => {
    const queries: StyleMemoryListRequestQuery[] = []
    await mockStyleMemoryList(page, ALL_MEMORIES, {
      onRequest: (query) => queries.push(query),
    })

    await openStyleMemoryList(page)

    const searchBox = page.getByRole('textbox')
    await waitForReactInput(searchBox)
    await searchBox.fill('subject')

    await expect
      .poll(() => queries.some((query) => query.search === 'subject'), { timeout: 10000 })
      .toBe(true)
    await expect(page.getByText(VERIFIED_MEMORY.name)).toBeVisible()
    await expect(page.getByText(PENDING_SOURCE_MEMORY.name)).toHaveCount(0)
    await expect(page).toHaveURL(/search=/, { timeout: 10000 })
  })

  test('TC-2.3 状态筛选：点击「用户已验证」发送 status=user_verified 并只显示已验证卡', async ({
    page,
  }) => {
    const queries: StyleMemoryListRequestQuery[] = []
    await mockStyleMemoryList(page, ALL_MEMORIES, {
      onRequest: (query) => queries.push(query),
    })

    await openStyleMemoryList(page)
    await expect(page.getByTestId('style-memory-card').first()).toBeVisible()

    await page.getByRole('button', { name: '用户已验证' }).click()

    await expect
      .poll(() => queries.some((query) => query.status === 'user_verified'), { timeout: 10000 })
      .toBe(true)
    await expect(page.getByText(VERIFIED_MEMORY.name)).toBeVisible()
    await expect(page.getByText(PENDING_SOURCE_MEMORY.name)).toHaveCount(0)
    await expect(page).toHaveURL(/status=user_verified/, { timeout: 10000 })
  })

  test('TC-2.4 search 与 status 组合生效：单请求同时携带两个参数', async ({ page }) => {
    const queries: StyleMemoryListRequestQuery[] = []
    await mockStyleMemoryList(page, ALL_MEMORIES, {
      onRequest: (query) => queries.push(query),
    })

    await openStyleMemoryList(page)

    const searchBox = page.getByRole('textbox')
    await waitForReactInput(searchBox)
    await searchBox.fill('编辑式构图')
    await expect(page).toHaveURL(/search=/, { timeout: 10000 })

    await page.getByRole('button', { name: '待验证' }).click()

    await expect
      .poll(
        () => {
          const last = queries[queries.length - 1]
          return last?.search === '编辑式构图' && last?.status === 'pending_verification'
        },
        { timeout: 10000 },
      )
      .toBe(true)
    await expect(page.getByText(PENDING_SOURCE_MEMORY.name)).toBeVisible()
    await expect(page.getByText(VERIFIED_MEMORY.name)).toHaveCount(0)
    await expect(page).toHaveURL(/search=/)
    await expect(page).toHaveURL(/status=pending_verification/)
  })

  test('TC-2.5 无结果时保留搜索与筛选条件，清除动作恢复全部卡片与 URL', async ({ page }) => {
    await mockStyleMemoryList(page, ALL_MEMORIES)

    await openStyleMemoryList(page)

    const searchBox = page.getByRole('textbox')
    await waitForReactInput(searchBox)
    // 「低饱和暖灰」只命中已验证卡；叠加「待验证」筛选 → 无结果
    await searchBox.fill('低饱和暖灰')
    await expect(page).toHaveURL(/search=/, { timeout: 10000 })
    await page.getByRole('button', { name: '待验证' }).click()

    const noResults = page.locator('section[data-status="noResults"]')
    await expect(noResults).toBeVisible({ timeout: 10000 })

    // 条件保留：输入值与 URL 参数均在
    await expect(searchBox).toHaveValue('低饱和暖灰')
    await expect(page).toHaveURL(/search=/)
    await expect(page).toHaveURL(/status=pending_verification/)

    // 清除动作：输入清空、URL 参数移除、卡片恢复
    const clearButton = noResults.getByRole('button', { name: /清除|clear/i })
    await expect(clearButton).toBeVisible()
    await clearButton.click()

    await expect(searchBox).toHaveValue('')
    await expect(page.getByText(VERIFIED_MEMORY.name)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(PENDING_SOURCE_MEMORY.name)).toBeVisible()
    await expect(page).not.toHaveURL(/search=/, { timeout: 10000 })
    await expect(page).not.toHaveURL(/status=/)
  })

  test('TC-2.6 进详情返回后条件与结果恢复：URL search/status 保持', async ({ page }) => {
    await mockStyleMemoryList(page, ALL_MEMORIES)

    await openStyleMemoryList(page)

    const searchBox = page.getByRole('textbox')
    await waitForReactInput(searchBox)
    await searchBox.fill('编辑式构图')
    await expect(page).toHaveURL(/search=/, { timeout: 10000 })
    await page.getByRole('button', { name: '待验证' }).click()
    await expect(page).toHaveURL(/status=pending_verification/, { timeout: 10000 })

    const pendingCard = page
      .getByTestId('style-memory-card')
      .filter({ hasText: PENDING_SOURCE_MEMORY.name })
    await expect(pendingCard).toBeVisible()
    await viewDetailEntry(pendingCard).click()

    await expect(page).toHaveURL(new RegExp(`/workspace/templates/${PENDING_SOURCE_MEMORY.id}`))

    // 浏览器返回列表：原条件与结果恢复
    await page.goBack()
    await expect(page.getByTestId('style-memory-page')).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/search=/, { timeout: 10000 })
    await expect(page).toHaveURL(/status=pending_verification/)
    await expect(searchBox).toHaveValue('编辑式构图')
    await expect(page.getByText(PENDING_SOURCE_MEMORY.name)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(VERIFIED_MEMORY.name)).toHaveCount(0)
  })

  test('TC-2.7 搜索提示承诺范围与实际谓词一致（aria 口径含名称/说明/风格规则/排除约束/变量）', async ({
    page,
  }) => {
    await mockStyleMemoryList(page, ALL_MEMORIES)

    await openStyleMemoryList(page)

    const searchBox = page.getByRole('textbox')
    await expect(searchBox).toBeVisible({ timeout: 15000 })
    await expect(searchBox).toHaveAccessibleName(/名称/)
    await expect(searchBox).toHaveAccessibleName(/说明/)
    await expect(searchBox).toHaveAccessibleName(/风格规则/)
    await expect(searchBox).toHaveAccessibleName(/排除约束/)
    await expect(searchBox).toHaveAccessibleName(/变量/)
  })

  // ─── AC-08 清除搜索按钮 ───

  test('TC-8.1 清除搜索按钮有可理解名称且命中面积 ≥ 44×44px', async ({ page }) => {
    await mockStyleMemoryList(page, ALL_MEMORIES)

    await openStyleMemoryList(page)

    const searchBox = page.getByRole('textbox')
    await waitForReactInput(searchBox)
    await searchBox.fill('低饱和')

    // 定位输入框所在搜索控件内的清除按钮（排除 noResults 状态区的同名主操作）
    const searchControl = searchBox.locator('..')
    const clearButton = searchControl.getByRole('button', { name: /清除搜索|clear search/i })
    await expect(clearButton).toBeVisible()

    const box = await clearButton.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  })

  // ─── AC-10 空态 / 未登录 / 服务异常 ───

  test('TC-10.1 空列表提供「打开工作区」与「查看 Iterations」双入口', async ({ page }) => {
    await mockStyleMemoryList(page, [])

    await openStyleMemoryList(page)

    const emptyState = page.locator('section[data-status="empty"]')
    await expect(emptyState).toBeVisible({ timeout: 15000 })

    const workspaceEntry = emptyState.getByRole('link', { name: /打开工作区/ })
    await expect(workspaceEntry).toHaveAttribute('href', '/workspace')

    const iterationsEntry = emptyState.getByRole('link', { name: /查看 Iterations/ })
    await expect(iterationsEntry).toHaveAttribute('href', '/workspace/iterations')
  })

  test('TC-10.2 401 未登录态保留查询条件，登录入口携带原 search/status 返回', async ({ page }) => {
    await mockApiError(page, '**/api/templates?**', 401, {
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
      retryable: false,
    })
    let signinRequestUrl: string | null = null
    await page.route('**/api/auth/signin**', async (route) => {
      signinRequestUrl = route.request().url()
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body>mock sign-in</body></html>',
      })
    })

    await openStyleMemoryList(
      page,
      `/workspace/templates?search=${encodeURIComponent('低饱和暖灰')}&status=user_verified`,
    )

    const authState = page.locator('section[data-status="authRequired"]')
    await expect(authState).toBeVisible({ timeout: 15000 })
    await expect(authState.getByRole('button', { name: /登录|log in|sign in/i })).toBeVisible()

    // 未登录态保留查询条件（URL 不被重置）
    await expect(page).toHaveURL(/search=/)
    await expect(page).toHaveURL(/status=user_verified/)

    // 登录入口返回原入口时携带原查询条件
    await authState.getByRole('button', { name: /登录|log in|sign in/i }).click()
    await expect.poll(() => signinRequestUrl, { timeout: 10000 }).not.toBeNull()
    const callbackUrl = decodeURIComponent(signinRequestUrl ?? '')
    expect(callbackUrl).toContain('callbackUrl=')
    expect(callbackUrl).toContain('search=')
    expect(callbackUrl).toContain('status=user_verified')
  })

  test('TC-10.3 503 服务错误态保留条件可重试，重试后恢复原条件与内容', async ({ page }) => {
    await mockStyleMemoryList(page, [VERIFIED_MEMORY, PENDING_SOURCE_MEMORY])

    // 首次 GET 返回 503，之后 fallback 到 mockStyleMemoryList（重试成功）
    let failedOnce = false
    await page.route('**/api/templates?**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      if (!failedOnce) {
        failedOnce = true
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Style Memory service temporarily unavailable',
            code: 'SERVICE_UNAVAILABLE',
            retryable: true,
          }),
        })
        return
      }
      await route.fallback()
    })

    await openStyleMemoryList(
      page,
      `/workspace/templates?search=${encodeURIComponent('低饱和暖灰')}&status=user_verified`,
    )

    const failedState = page.locator('section[data-status="failedRecoverable"]')
    await expect(failedState).toBeVisible({ timeout: 15000 })
    await expect(failedState.getByRole('button', { name: /重试|retry/i })).toBeVisible()

    // 错误态下搜索/筛选条件仍可见（工具栏不被整体隐藏），输入值保留
    const searchBox = page.getByRole('textbox')
    await expect(searchBox).toBeVisible()
    await expect(searchBox).toHaveValue('低饱和暖灰')

    await failedState.getByRole('button', { name: /重试|retry/i }).click()

    // 重试成功恢复原条件与内容
    await expect(page.getByText(VERIFIED_MEMORY.name)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(PENDING_SOURCE_MEMORY.name)).toHaveCount(0)
    await expect(page).toHaveURL(/search=/)
    await expect(page).toHaveURL(/status=user_verified/)
    await expect(searchBox).toHaveValue('低饱和暖灰')
  })

  // ─── 导航术语（ADR-8） ───

  test('TC-11 导航显示「Style Memory」而非「Library」', async ({ page }) => {
    await mockStyleMemoryList(page, [VERIFIED_MEMORY])

    await openStyleMemoryList(page)

    const sidebar = page.getByRole('complementary', { name: /workspace navigation/i })
    await expect(sidebar).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Style Memory', exact: true })).toBeVisible()
    await expect(sidebar.getByText('Style Memory', { exact: true })).toBeVisible()
    await expect(sidebar.getByText('Library', { exact: true })).toHaveCount(0)
  })
})
