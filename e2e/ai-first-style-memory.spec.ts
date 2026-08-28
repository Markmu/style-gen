import { expect, test, type Page } from '@playwright/test'
import {
  mockApiError,
  mockAuthSession,
  mockGenerationList,
  mockStyleMemoryList,
  mockTemplateCollection,
  type MockStyleMemoryListItem,
} from './helpers/mock-api'
import { waitForReactInput } from './helpers/react-ready'

const STORAGE_KEY = 'style-gen-workspace-state'

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

// plan-04：列表页消费 GET /api/templates 新 DTO（mockStyleMemoryList 提供服务端谓词）
const listMemories: MockStyleMemoryListItem[] = [
  {
    id: 'style-memory-editorial-soft-light',
    name: 'Editorial Soft Light Memory',
    verificationStatus: 'user_verified',
    retainedRulesPreview: ['柔和漫射光与半透明表面', '低饱和色调与留白构图'],
    variableCount: 2,
    sourceImageUrl: 'https://cdn.example.com/references/style-memory-source/original.png',
    representativeImageUrl: 'https://cdn.example.com/results/style-memory-representative.webp',
    lastUsedAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'style-memory-text-only',
    name: 'Prompt Structure Only',
    verificationStatus: 'pending_verification',
    retainedRulesPreview: [],
    variableCount: 0,
    sourceImageUrl: null,
    representativeImageUrl: null,
    lastUsedAt: null,
    updatedAt: '2024-01-02T00:00:00.000Z',
  },
]

// “使用”走 detail API（source-backed 快照预写工作台），由旧集合 mock 提供详情
const detailRecords = [
  {
    id: 'style-memory-editorial-soft-light',
    name: 'Editorial Soft Light Memory',
    content:
      'Create {{subject}} inside {{scene}} with diffused daylight, translucent surfaces, and precise editorial spacing.',
    variables: [
      {
        name: 'subject',
        label: 'Subject',
        defaultValue: 'glass sculpture',
        sourceField: 'subject',
      },
      {
        name: 'scene',
        label: 'Scene',
        defaultValue: 'white studio',
        sourceField: 'scene',
      },
    ],
    sourceAssetId: 'style-memory-source-asset',
    sourceImageUrl: 'https://cdn.example.com/references/style-memory-source/original.png',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
]

function appShell(page: Page) {
  return page.getByTestId('app-shell')
}

function statePresenter(page: Page, status: string) {
  return page.locator(`section[data-status="${status}"]`)
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

async function openStyleMemory(page: Page) {
  try {
    await page.goto('/workspace/templates', { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }

  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
}

test.describe('plan-06 Style Memory template library migration', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  test('TC-6.1 populated list uses Style Memory identity and evidence-rich cards', async ({
    page,
  }) => {
    await mockStyleMemoryList(page, listMemories)

    await openStyleMemory(page)

    await expect(appShell(page)).toHaveAttribute('data-variant', 'memory')
    await expect(page.getByRole('heading', { name: /^Style Memory$/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Template Library$/i })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: listMemories[0].name })).toBeVisible()
    // 搜索提示 aria 承载全量谓词口径（plan-04）
    await expect(
      page.getByRole('textbox', { name: /Search Style Memory by name/ }),
    ).toBeVisible()
    await expect(page.getByText('2 items')).toBeVisible()
    await expect(page.getByRole('button', { name: /Open workspace/ })).toBeVisible()
  })

  test('TC-6.1 mobile Library uses a compact navigation rail without horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockStyleMemoryList(page, listMemories)

    await openStyleMemory(page)

    const sidebar = page.getByRole('complementary', { name: /workspace navigation/i })
    const pageFrame = page.getByTestId('style-memory-page')
    await expect(sidebar).toBeVisible()
    await expect(pageFrame).toBeVisible()

    const [sidebarBox, pageBox, bodyWidth] = await Promise.all([
      sidebar.boundingBox(),
      pageFrame.boundingBox(),
      page.evaluate(() => document.body.scrollWidth),
    ])

    expect(sidebarBox?.width).toBeLessThanOrEqual(80)
    expect(pageBox?.width).toBeGreaterThanOrEqual(300)
    expect(bodyWidth).toBeLessThanOrEqual(390)
    await expect(page.getByRole('button', { name: 'Use', exact: true }).first()).toBeVisible()
  })

  test('TC-6.1 card previews, status badges, and rule summaries are visible', async ({ page }) => {
    await mockStyleMemoryList(page, listMemories)

    await openStyleMemory(page)

    // 已验证卡：代表结果主预览 + 参考图标注 + 真实规则摘要 + 变量数 + 最近使用
    const verifiedCard = page.getByTestId('style-memory-card').first()
    await expect(verifiedCard.getByText('User verified')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: listMemories[0].name }),
    ).toBeVisible()
    await expect(
      verifiedCard.getByRole('img', { name: `Representative result for ${listMemories[0].name}` }),
    ).toBeVisible()
    await expect(verifiedCard.getByText('Reference')).toBeVisible()
    await expect(verifiedCard.getByText(/柔和漫射光与半透明表面/)).toBeVisible()
    await expect(verifiedCard.getByText('2 variables')).toBeVisible()
    await expect(verifiedCard.getByText('Never used')).toHaveCount(0)

    // pending 卡（无来源图）：No preview 占位 + No rules yet + Never used，不用成功语气
    const pendingCard = page.getByTestId('style-memory-card').nth(1)
    await expect(pendingCard.getByText('Pending verification')).toBeVisible()
    await expect(pendingCard.getByText('No preview')).toBeVisible()
    await expect(pendingCard.getByText('No rules yet')).toBeVisible()
    await expect(pendingCard.getByText('Never used')).toBeVisible()

    // 名称派生标签（Source-backed / Prompt-only / Style tags / Reuse intent）已移除
    await expect(
      page.getByText(/Source-backed|Prompt-only|Style tags|Reuse intent/i),
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Use', exact: true }).first()).toBeVisible()
  })

  test('TC-6.2 使用 injects prompt and variables through the existing template detail API', async ({
    page,
  }) => {
    // 列表走新 DTO mock；“使用”后的 detail 快照仍走既有集合 mock
    await mockTemplateCollection(page, detailRecords)
    await mockStyleMemoryList(page, [listMemories[0]])

    await openStyleMemory(page)
    await page.getByRole('heading', { name: listMemories[0].name }).hover()
    const useMemoryButton = page.getByRole('button', { name: 'Use', exact: true })
    await expect(useMemoryButton).toBeVisible({ timeout: 5000 })
    await useMemoryButton.click()

    // plan-07：「使用」接管为复用预检；本模板变量均含默认值，确认后经
    // 快照握手进入 /workspace?templateId= 并回落，提示与变量按既有 detail API 加载
    const reusePrecheck = page.getByTestId('reuse-precheck-dialog')
    await expect(reusePrecheck).toBeVisible({ timeout: 15000 })
    await reusePrecheck.getByRole('button', { name: /^Enter workspace$/ }).click()

    await expect(page).toHaveURL(/\/workspace/)
    await expect(page.getByTestId('unified-prompt-editor')).toBeVisible({ timeout: 15000 })
    await page.getByLabel('Prompt mode').selectOption('variables')
    await expect(page.getByLabel('Variable subject')).toHaveValue('glass sculpture')
    await expect(page.getByLabel('Variable scene')).toHaveValue('white studio')
    await page.getByLabel('Prompt mode').selectOption('text')
    await expect(page.getByLabel('Full Generation Prompt')).toHaveValue(
      /glass sculpture.*white studio/i,
    )
  })

  // plan-04 起，卡片只保留“View details / Use”；Duplicate/Delete 的 UI 入口与
  // API 契约断言移交详情页（plan-05）与 route 单测。原 TC-6.3 卡片治理用例随之移除。

  test('TC-6.4 empty library offers workspace and Iterations entries', async ({ page }) => {
    await mockStyleMemoryList(page, [])

    await openStyleMemory(page)

    const emptyState = statePresenter(page, 'empty')
    await expect(emptyState).toBeVisible()
    await expect(emptyState).toContainText(/style memory/i)
    await expect(emptyState).toContainText(/workspace|iteration/i)
    // 空态双入口：Open workspace / View iterations（href 断言）
    await expect(emptyState.getByRole('link', { name: /Open workspace/ })).toHaveAttribute(
      'href',
      '/workspace',
    )
    await expect(emptyState.getByRole('link', { name: /View iterations/ })).toHaveAttribute(
      'href',
      '/workspace/iterations',
    )
    await expect(page.getByText(/No templates yet/i)).toHaveCount(0)
  })

  test('TC-6.5 search no results can be cleared without losing the Style Memory context', async ({
    page,
  }) => {
    await mockStyleMemoryList(page, [listMemories[0]])

    await openStyleMemory(page)
    const searchBox = page.getByRole('textbox')
    await waitForReactInput(searchBox)
    await searchBox.fill('brutalist neon collage')
    await expect(searchBox).toHaveValue('brutalist neon collage')

    const noResultsState = statePresenter(page, 'noResults')
    await expect(noResultsState).toBeVisible({ timeout: 10000 })
    await expect(noResultsState).toContainText(/style memor|No matching/i)
    await expect(
      noResultsState.getByRole('button', { name: /clear search/i }),
    ).toBeVisible()
    await expect(
      noResultsState.getByRole('button', { name: /back to workspace/i }),
    ).toBeVisible()

    await noResultsState.getByRole('button', { name: /clear search/i }).click()
    await expect(page.getByRole('textbox')).toHaveValue('')
  })

  test('TC-6.6 API failure shows failedRecoverable instead of an empty memory lesson', async ({
    page,
  }) => {
    await mockApiError(page, '**/api/templates?**', 500, {
      error: 'Style Memory service temporarily unavailable',
      code: 'TEMPLATE_UNAVAILABLE',
      retryable: true,
    })

    await openStyleMemory(page)

    const failedState = statePresenter(page, 'failedRecoverable')
    await expect(failedState).toBeVisible()
    await expect(failedState).toContainText(/style memory|service|temporarily unavailable|retry/i)
    await expect(failedState.getByRole('button', { name: /retry/i })).toBeVisible()
    await expect(
      failedState.getByRole('button', { name: /back to workspace/i }),
    ).toBeVisible()
    await expect(statePresenter(page, 'empty')).toHaveCount(0)
    await expect(statePresenter(page, 'noResults')).toHaveCount(0)
  })

  test('TC-6.7 auth restricted Style Memory keeps the workspace snapshot and offers login', async ({
    page,
  }) => {
    const workspaceSnapshot = JSON.stringify({
      version: 3,
      assetId: 'persisted-asset-id',
      referenceImageUrl: 'https://cdn.example.com/references/persisted/original.png',
      analysisTaskId: 'persisted-analysis-id',
      promptText: 'Persisted cinematic prompt',
      negativePromptText: 'low quality',
      generationTaskId: null,
    })

    await page.addInitScript(
      ({ key, value }) => window.sessionStorage.setItem(key, value),
      { key: STORAGE_KEY, value: workspaceSnapshot },
    )
    await mockApiError(page, '**/api/templates?**', 401, {
      error: 'Authentication required',
    })

    await openStyleMemory(page)

    const authState = statePresenter(page, 'authRequired')
    await expect(authState).toBeVisible()
    await expect(authState).toContainText(/log in|sign in|login/i)
    await expect(
      authState.getByRole('button', { name: /log in|sign in|login/i }),
    ).toBeVisible()
    await expect(
      authState.getByRole('button', { name: /back to workspace/i }),
    ).toBeVisible()

    const stored = await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY)
    expect(stored).toBe(workspaceSnapshot)
  })
})
