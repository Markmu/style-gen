import { expect, test, type Page } from '@playwright/test'
import {
  mockApiError,
  mockAuthSession,
  mockIterationList,
  mockLoggedOutSession,
  type IterationListRequestQuery,
  type MockIterationListItem,
} from './helpers/mock-api'

/**
 * plan-02 — Iteration Memory 列表页 E2E（red → green）
 *
 * 来源：docs/13-Iteration-Memory闭环补全/13-2-实现计划-Iteration-Memory闭环补全/plan-02-IterationMemory列表页.md
 * §5 E2E 验收：三态列表渲染、默认 status=all、搜索/筛选组合、加载较早、
 * 导航往返保位、无匹配行动、未登录面、列表 5xx 面（另含 AC-07 空态与 L1 图片降级）。
 *
 * 页面选择器契约（实现方需提供）：
 * - [data-testid="iteration-list"] — 列表滚动容器（保位断言依赖其 scrollTop）
 * - [data-testid="iteration-list-item"][data-status="completed|processing|failed"] — 三态条目
 * - [data-testid="iteration-state-face"][data-face="empty|no-match|unauthorized|error"] — 状态面
 * - textbox "Search iterations…"、radiogroup "Status filter"（All/Processing/Completed/Failed）
 * - button "Load earlier…" / "Clear search" / "Retry"，以及返回工作台导航动作
 */
const WORKSPACE_STATE_STORAGE_KEY = 'style-gen-workspace-state'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

function iterationItem(overrides: {
  id: string
  status: MockIterationListItem['status']
  promptSummary: string
  resultFileUrl?: string
  createdAt?: string
}): MockIterationListItem {
  return {
    id: overrides.id,
    status: overrides.status,
    promptSummary: overrides.promptSummary,
    resultFileUrl:
      overrides.resultFileUrl ??
      (overrides.status === 'completed'
        ? `https://cdn.example.com/generated/${overrides.id}/result.webp`
        : null),
    params: { aspectRatio: '16:9', quality: 'hd' },
    createdAt: overrides.createdAt ?? '2024-01-01T00:00:00.000Z',
  }
}

const threeStateItems: MockIterationListItem[] = [
  iterationItem({
    id: 'iter-completed',
    status: 'completed',
    promptSummary: 'Neon cityscape at dusk',
    createdAt: '2024-03-03T09:00:00.000Z',
  }),
  iterationItem({
    id: 'iter-processing',
    status: 'processing',
    promptSummary: 'Watercolor petals study',
    createdAt: '2024-03-02T09:00:00.000Z',
  }),
  iterationItem({
    id: 'iter-failed',
    status: 'failed',
    promptSummary: 'Neon cityscape retry attempt',
    createdAt: '2024-03-01T09:00:00.000Z',
  }),
]

/** 最新在前；每条 promptSummary 都含 "Neon"，q=neon 时保留全集 */
function buildIterationArchive(count: number): MockIterationListItem[] {
  return Array.from({ length: count }, (_, index) => {
    const seq = String(index + 1).padStart(3, '0')
    const status: MockIterationListItem['status'] =
      index === 2 ? 'processing' : index === 5 ? 'failed' : 'completed'
    return iterationItem({
      id: `iter-${seq}`,
      status,
      promptSummary: `Neon archive study ${seq}`,
      createdAt: new Date(Date.UTC(2024, 0, 1 + index)).toISOString(),
    })
  })
}

function iterationItems(page: Page, status?: MockIterationListItem['status']) {
  return status
    ? page.locator(`[data-testid="iteration-list-item"][data-status="${status}"]`)
    : page.getByTestId('iteration-list-item')
}

function stateFace(page: Page, face: 'empty' | 'no-match' | 'unauthorized' | 'error') {
  return page.locator(`[data-testid="iteration-state-face"][data-face="${face}"]`)
}

function searchInput(page: Page) {
  return page.getByRole('textbox', { name: /search iteration/i })
}

function statusFilter(page: Page) {
  return page.getByRole('radiogroup', { name: /status filter|filter by status/i })
}

function loadEarlierButton(page: Page) {
  return page.getByRole('button', { name: /load earlier|browse earlier|earlier records/i })
}

function backToWorkspaceAction(page: Page) {
  const name = /back to workspace|return to workspace|open workspace/i
  return page.getByRole('link', { name }).or(page.getByRole('button', { name }))
}

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

async function openIterations(page: Page, query = '') {
  try {
    await page.goto(`/workspace/iterations${query}`, { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }

  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
}

test.describe('plan-02 Iteration Memory list page', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockCdnImages(page)
  })

  test('TC-2.1 direct visit defaults to all statuses with real previews only for completed', async ({ page }) => {
    const requests: IterationListRequestQuery[] = []
    await mockIterationList(page, threeStateItems, {
      onRequest: (query) => requests.push(query),
    })

    await openIterations(page)

    await expect(page.getByRole('heading', { name: /iteration memory/i })).toBeVisible()
    await expect(searchInput(page)).toBeVisible()
    await expect(searchInput(page)).toHaveValue('')
    await expect(statusFilter(page).getByRole('radio', { name: /^all/i })).toBeChecked()

    const completedItem = iterationItems(page, 'completed')
    await expect(completedItem).toHaveCount(1)
    await expect(completedItem.getByRole('img')).toBeVisible()
    await expect(completedItem.getByRole('img')).toHaveAttribute(
      'src',
      /cdn\.example\.com\/generated\/iter-completed\/result\.webp/,
    )
    await expect(completedItem).toContainText('Neon cityscape at dusk')
    await expect(completedItem).toContainText(/16:9/)
    await expect(completedItem).toContainText(/\bhd\b/i)
    await expect(completedItem).toContainText(/completed/i)

    const processingItem = iterationItems(page, 'processing')
    await expect(processingItem).toHaveCount(1)
    await expect(processingItem.getByRole('img')).toHaveCount(0)
    await expect(processingItem).toContainText(/processing|in progress/i)
    await expect(processingItem).toContainText('Watercolor petals study')

    const failedItem = iterationItems(page, 'failed')
    await expect(failedItem).toHaveCount(1)
    await expect(failedItem.getByRole('img')).toHaveCount(0)
    await expect(failedItem).toContainText(/failed|error/i)
    await expect(failedItem).toContainText('Neon cityscape retry attempt')

    expect(requests.length, 'iteration list endpoint was queried').toBeGreaterThan(0)
    expect(requests[0].status, 'page-level default status must be all').toBe('all')
  })

  test('TC-2.2 keyword search and status filter combine to narrow the list', async ({ page }) => {
    const requests: IterationListRequestQuery[] = []
    await mockIterationList(page, threeStateItems, {
      onRequest: (query) => requests.push(query),
    })

    await openIterations(page)
    await expect(iterationItems(page)).toHaveCount(3)

    await searchInput(page).fill('neon')

    await expect(iterationItems(page)).toHaveCount(2)
    await expect(iterationItems(page, 'processing')).toHaveCount(0)

    await statusFilter(page).getByRole('radio', { name: /^failed/i }).check()

    const failedMatches = iterationItems(page, 'failed')
    await expect(failedMatches).toHaveCount(1)
    await expect(failedMatches).toContainText('Neon cityscape retry attempt')

    const lastRequest = requests[requests.length - 1]
    expect(lastRequest?.q).toBe('neon')
    expect(lastRequest?.status).toBe('failed')
    await expect(page).toHaveURL(/q=neon/)
    await expect(page).toHaveURL(/status=failed/)
  })

  test('TC-2.3 "load earlier" appends the older cursor page without duplicates', async ({ page }) => {
    const requests: IterationListRequestQuery[] = []
    const archive = buildIterationArchive(25)
    await mockIterationList(page, archive, {
      onRequest: (query) => requests.push(query),
    })

    await openIterations(page)

    await expect(iterationItems(page)).toHaveCount(20)

    const loadEarlier = loadEarlierButton(page)
    await expect(loadEarlier).toBeVisible()
    await loadEarlier.click()

    await expect(iterationItems(page)).toHaveCount(25)
    await expect(
      iterationItems(page).filter({ hasText: archive[24].promptSummary }),
    ).toHaveCount(1)
    await expect(loadEarlier).toHaveCount(0)

    expect(
      requests.some((query) => (query.cursor ?? '').length > 0),
      'the second page request must carry the keyset cursor',
    ).toBe(true)
  })

  test('TC-2.4 returning from the workspace preserves search, filter, loaded depth, and scroll', async ({ page }) => {
    const archive = buildIterationArchive(26)
    await mockIterationList(page, archive)

    await openIterations(page)

    await searchInput(page).fill('neon')
    await statusFilter(page).getByRole('radio', { name: /^completed/i }).check()

    const completedCount = archive.filter((item) => item.status === 'completed').length
    await expect(iterationItems(page)).toHaveCount(20)

    await loadEarlierButton(page).click()
    await expect(iterationItems(page)).toHaveCount(completedCount)

    const list = page.getByTestId('iteration-list')
    await list.evaluate((el) => {
      el.scrollTop = 600
    })
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(600)

    await page.getByRole('link', { name: 'Generate' }).click()
    // Wait for real arrival on /workspace: [data-testid="app-shell"] exists on every
    // route, so asserting its visibility cannot wait for the navigation to commit.
    // goBack() issued before the commit would land on the tab's initial about:blank
    // history entry (a blank document), failing the test for harness reasons only.
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 15000 })

    await page.goBack()

    await expect(searchInput(page)).toHaveValue('neon')
    await expect(statusFilter(page).getByRole('radio', { name: /^completed/i })).toBeChecked()
    await expect(iterationItems(page)).toHaveCount(completedCount)
    await expect
      .poll(() => list.evaluate((el) => el.scrollTop), { timeout: 15000 })
      .toBeGreaterThan(400)
  })

  test('TC-2.5 no search match keeps the conditions and offers clear and switch actions', async ({ page }) => {
    await mockIterationList(page, threeStateItems)

    await openIterations(page)
    await statusFilter(page).getByRole('radio', { name: /^failed/i }).check()
    await expect(iterationItems(page)).toHaveCount(1)

    await searchInput(page).fill('aurora-void')

    const noMatchFace = stateFace(page, 'no-match')
    await expect(noMatchFace).toBeVisible()
    await expect(searchInput(page)).toHaveValue('aurora-void')
    await expect(statusFilter(page).getByRole('radio', { name: /^failed/i })).toBeChecked()

    await expect(
      noMatchFace.getByRole('button', { name: /clear (the )?search|clear keyword|reset search/i }),
    ).toBeVisible()
    await expect(
      noMatchFace
        .getByRole('button', {
          name: /switch.*filter|reset.*filter|change.*filter|show all|all statuses/i,
        })
        .or(
          noMatchFace.getByRole('link', {
            name: /switch.*filter|reset.*filter|change.*filter|show all|all statuses/i,
          }),
        ),
    ).toBeVisible()

    await noMatchFace.getByRole('button', { name: /clear (the )?search|clear keyword|reset search/i }).click()

    await expect(stateFace(page, 'no-match')).toHaveCount(0)
    await expect(iterationItems(page)).toHaveCount(1)
  })

  test('TC-2.6 signed-out visitors get a login guide without wiping local workspace state', async ({ page }) => {
    await mockLoggedOutSession(page)
    await mockApiError(page, '**/api/generation?**', 401, {
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
      retryable: false,
    })
    const seededWorkspaceState = '{"prompt":"draft still here"}'
    await page.addInitScript(
      (payload) => {
        window.localStorage.setItem(payload.key, payload.seed)
      },
      { key: WORKSPACE_STATE_STORAGE_KEY, seed: seededWorkspaceState },
    )

    await openIterations(page)

    const unauthorizedFace = stateFace(page, 'unauthorized')
    await expect(unauthorizedFace).toBeVisible()
    await expect(unauthorizedFace).toContainText(/sign in|log in/i)
    await expect(
      unauthorizedFace.getByRole('link', { name: /sign in|log in/i }).or(
        unauthorizedFace.getByRole('button', { name: /sign in|log in/i }),
      ),
    ).toBeVisible()
    await expect(backToWorkspaceAction(page)).toBeVisible()
    await expect(iterationItems(page)).toHaveCount(0)

    const preservedState = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      WORKSPACE_STATE_STORAGE_KEY,
    )
    expect(preservedState).toBe(seededWorkspaceState)
  })

  test('TC-2.7 list 5xx explains the workspace is unaffected and retry recovers', async ({ page }) => {
    await mockApiError(page, '**/api/generation?**', 500, {
      error: 'Iteration history temporarily unavailable',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })

    await openIterations(page)

    const errorFace = stateFace(page, 'error')
    await expect(errorFace).toBeVisible()
    await expect(errorFace).toContainText(/workspace/i)
    await expect(errorFace.getByRole('button', { name: /retry|try again/i })).toBeVisible()
    await expect(backToWorkspaceAction(page)).toBeVisible()

    await page.unroute('**/api/generation?**')
    await mockIterationList(page, threeStateItems)
    await errorFace.getByRole('button', { name: /retry|try again/i }).click()

    await expect(iterationItems(page)).toHaveCount(3)
    await expect(stateFace(page, 'error')).toHaveCount(0)
  })

  test('TC-2.8 first visit with no records guides the first creation', async ({ page }) => {
    await mockIterationList(page, [])

    await openIterations(page)

    const emptyFace = stateFace(page, 'empty')
    await expect(emptyFace).toBeVisible()
    await expect(emptyFace).toContainText(/iteration/i)
    await expect(
      emptyFace
        .getByRole('link', { name: /start|begin|create/i })
        .or(emptyFace.getByRole('button', { name: /start|begin|create/i })),
    ).toBeVisible()
    await expect(backToWorkspaceAction(page)).toBeVisible()
    await expect(iterationItems(page)).toHaveCount(0)
  })

  test('TC-2.9 a broken result image degrades to a placeholder without losing item info', async ({ page }) => {
    const brokenItem = iterationItem({
      id: 'iter-broken-image',
      status: 'completed',
      promptSummary: 'Neon cityscape with expired asset',
      resultFileUrl: 'https://cdn.example.com/generated/iter-broken-image/result.webp',
      createdAt: '2024-02-02T09:00:00.000Z',
    })
    await page.route('https://cdn.example.com/generated/iter-broken-image/**', async (route) => {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' })
    })
    await mockIterationList(page, [brokenItem, threeStateItems[0]])

    await openIterations(page)

    const degradedItem = iterationItems(page).filter({ hasText: 'expired asset' })
    await expect(degradedItem).toHaveCount(1)
    await expect(degradedItem).toContainText(/unavailable|failed to load|missing preview|cannot load/i)
    await expect(degradedItem).toContainText('Neon cityscape with expired asset')
    await expect(degradedItem).toContainText(/16:9/)
    await expect(degradedItem).toContainText(/completed/i)
  })

  test('TC-2.10 compact widths keep the toolbar and item hierarchy readable', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await mockIterationList(page, threeStateItems)

    await openIterations(page)
    await expect(iterationItems(page)).toHaveCount(3)

    const searchBox = await searchInput(page).boundingBox()
    const filterBox = await statusFilter(page).boundingBox()
    expect(searchBox?.width ?? 0).toBeGreaterThan(400)
    expect(filterBox?.y ?? 0).toBeGreaterThan(
      (searchBox?.y ?? 0) + (searchBox?.height ?? 0) - 2,
    )

    await page.setViewportSize({ width: 390, height: 844 })

    const firstItem = iterationItems(page).first()
    await expect(firstItem).toBeVisible()
    expect(
      await firstItem.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)

    const summary = firstItem.getByTestId('iteration-item-summary')
    await expect(summary).toHaveText('Neon cityscape at dusk')
    const summaryBox = await summary.boundingBox()
    expect(summaryBox?.width ?? 0).toBeGreaterThan(120)
  })
})
