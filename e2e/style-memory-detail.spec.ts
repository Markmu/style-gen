import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  mockAuthSession,
  mockGenerationList,
  mockIterationDetail,
  mockIterationList,
  mockStyleMemoryDetailCollection,
  mockStyleMemoryDetailRetrySequence,
  type MockIterationDetail,
  type MockIterationListItem,
  type MockRepresentativeCandidate,
  type MockStyleMemoryDetail,
} from './helpers/mock-api'

// plan-05: Style Memory 详情页（AC-03 / AC-05 / AC-07 / AC-08 / AC-09 / AC-10）
// 后端 plan-02 详情/治理端点已就绪；本 spec 为 red 先行，驱动 /workspace/templates/[id]
// 详情路由、四分区视图、编辑回退、代表结果选择器、复制与删除治理闭环实现。
//
// 页面契约（test-e2e 用例约定，实现须满足）：
// - [data-testid="style-memory-detail-page"] — 详情页主容器
// - [data-testid="style-memory-detail-header"] — 页面头（返回列表 / 名称 / 状态徽标 / 编辑 / 更多 / 使用）
// - [data-testid="style-memory-detail-evidence"] — 分区「Evidence」
// - [data-testid="style-memory-detail-style"] — 分区「Retained style」
// - [data-testid="style-memory-detail-variables"] — 分区「Replaceable」
// - [data-testid="style-memory-detail-constraints"] — 分区「Constraints & enhancements」
// - [data-testid="style-memory-detail-usage"] — 分区「Usage」
// - 弹层用 plan-03 原语：dialog role + Tab 循环 + Escape 还原；菜单 menu/menuitem

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** 已验证 Memory：四分区数据完整（AC-03 / AC-05 基准数据） */
const VERIFIED_MEMORY: MockStyleMemoryDetail = {
  id: 'style-memory-verified-editorial',
  name: 'Editorial Soft Daylight',
  description: '从 8 月编辑部拍摄保存的柔和日光方向',
  content:
    'Create {{subject}} in {{scene}} with soft diffused daylight, low-saturation warm gray palette and fine grain texture.',
  variables: [
    { name: 'subject', defaultValue: '玻璃器皿', label: '主体' },
    { name: 'scene', defaultValue: '窗边桌面', label: '场景' },
    { name: 'wardrobe', defaultValue: '', label: '服饰' },
  ],
  retainedRules: [
    '构图保持主体居中但保留大面积留白',
    '光线柔和、无硬阴影',
    '材质保留细颗粒与纸张感',
  ],
  negativeConstraints: ['避免高饱和霓虹色', '避免强烈镜面反射'],
  styleTokens: ['低饱和暖灰', '柔和漫射光', '颗粒质感'],
  enhancementHints: ['编辑式排版留白', '自然日光色温'],
  verificationStatus: 'user_verified',
  representativeGenerationTaskId: 'gen-representative-task-01',
  sourceAssetId: 'asset-editorial-source',
  sourceImageUrl: 'https://cdn.example.com/references/verified-source/original.webp',
  sourceGenerationTaskId: 'gen-source-task-01',
  sourceGenerationTask: { id: 'gen-source-task-01', createdAt: '2026-08-10T08:00:00.000Z' },
  representativeResult: {
    iterationId: 'gen-representative-task-01',
    imageUrl: 'https://cdn.example.com/results/verified-representative.webp',
    createdAt: '2026-08-12T08:00:00.000Z',
  },
  usage: { lastUsedAt: '2026-08-20T10:00:00.000Z', derivedIterationCount: 3 },
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

/** 已验证 Memory 的代表结果候选（替换场景：新结果 + 当前代表结果） */
const VERIFIED_CANDIDATES: MockRepresentativeCandidate[] = [
  {
    id: 'gen-candidate-new',
    imageUrl: 'https://cdn.example.com/results/editorial-new-representative.webp',
    promptSummary: '玻璃器皿 · 窗边 · 柔光',
    createdAt: '2026-08-24T09:00:00.000Z',
  },
  {
    id: 'gen-representative-task-01',
    imageUrl: 'https://cdn.example.com/results/verified-representative.webp',
    promptSummary: '初始代表结果 · 柔光',
    createdAt: '2026-08-12T08:00:00.000Z',
  },
]

/** pending Memory：有来源图与来源 Iteration，无代表结果（AC-05 选择代表结果基准） */
const PENDING_MEMORY: MockStyleMemoryDetail = {
  id: 'style-memory-pending-macro',
  name: 'Macro Paper Texture',
  description: null,
  content: 'Macro shot of {{subject}} on paper texture with soft top light.',
  variables: [{ name: 'subject', defaultValue: '干花标本', label: '主体' }],
  retainedRules: ['编辑式构图并保留大面积留白', '纸张纹理与哑光表面'],
  negativeConstraints: ['避免塑料光泽'],
  styleTokens: ['纸张纹理', '哑光表面'],
  enhancementHints: ['微距浅景深'],
  verificationStatus: 'pending_verification',
  representativeGenerationTaskId: null,
  sourceAssetId: 'asset-macro-source',
  sourceImageUrl: 'https://cdn.example.com/references/pending-source/original.webp',
  sourceGenerationTaskId: 'gen-macro-source',
  sourceGenerationTask: { id: 'gen-macro-source', createdAt: '2026-08-18T08:00:00.000Z' },
  representativeResult: null,
  usage: { lastUsedAt: null, derivedIterationCount: 0 },
  createdAt: '2026-08-18T08:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
}

/** pending Memory 的候选（3 条，配合 candidatePageSize=2 驱动「Load earlier」） */
const PENDING_CANDIDATES: MockRepresentativeCandidate[] = [
  {
    id: 'gen-macro-candidate-03',
    imageUrl: 'https://cdn.example.com/results/macro-candidate-03.webp',
    promptSummary: '纸张肌理 · 顶光 · 大留白',
    createdAt: '2026-08-22T09:00:00.000Z',
  },
  {
    id: 'gen-macro-candidate-02',
    imageUrl: 'https://cdn.example.com/results/macro-candidate-02.webp',
    promptSummary: '牛皮纸 · 侧逆光 · 特写',
    createdAt: '2026-08-21T09:00:00.000Z',
  },
  {
    id: 'gen-macro-candidate-01',
    imageUrl: 'https://cdn.example.com/results/macro-candidate-01.webp',
    promptSummary: '白卡纸 · 漫射光 · 静物',
    createdAt: '2026-08-20T09:00:00.000Z',
  },
]

/** 旧资产：规则/来源图/来源迭代/代表结果全缺（AC-09 基准） */
const LEGACY_MEMORY: MockStyleMemoryDetail = {
  id: 'style-memory-legacy-plain',
  name: 'Early Prompt Draft',
  description: null,
  content: 'Legacy draft prompt with {{subject}} placeholder',
  variables: [{ name: 'subject', defaultValue: '' }],
  retainedRules: [],
  negativeConstraints: [],
  styleTokens: [],
  enhancementHints: [],
  verificationStatus: 'pending_verification',
  representativeGenerationTaskId: null,
  sourceAssetId: null,
  sourceImageUrl: null,
  sourceGenerationTaskId: null,
  sourceGenerationTask: null,
  representativeResult: null,
  usage: { lastUsedAt: null, derivedIterationCount: 1 },
  createdAt: '2026-01-05T08:00:00.000Z',
  updatedAt: '2026-01-05T08:00:00.000Z',
}

/** 来源 Iteration 列表条目（AC-07「删除后仍可访问」与 TC-3.2 focus 定位共用） */
const SOURCE_ITERATIONS: MockIterationListItem[] = [
  {
    id: 'gen-source-task-01',
    status: 'completed',
    promptSummary: 'Editorial 柔光初版生成',
    resultFileUrl: 'https://cdn.example.com/results/verified-representative.webp',
    params: { aspectRatio: '4:3', quality: 'standard' },
    createdAt: '2026-08-10T08:00:00.000Z',
  },
]

/** 来源 Iteration 详情（TC-3.2 focus 定位后 selectedId 联动详情面板） */
const SOURCE_ITERATION_DETAIL: MockIterationDetail = {
  id: 'gen-source-task-01',
  analysisTaskId: 'mock-analysis-task-id',
  status: 'completed',
  promptSnapshot: 'Editorial 柔光初版生成',
  negativePromptSnapshot: '',
  params: { aspectRatio: '4:3', quality: 'standard' },
  modelName: 'mock-model',
  resultFileUrl: 'https://cdn.example.com/results/verified-representative.webp',
  errorMessage: null,
  recipe: null,
  recipeSource: 'missing',
  variables: [],
  variablesSource: 'missing',
  sourceImageUrl: 'https://cdn.example.com/references/verified-source/original.webp',
  sourceAssetId: 'asset-editorial-source',
  sourceTemplateId: null,
  sourceTemplateName: null,
  savedTemplate: null,
  analysisTemplateVariables: [],
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-10T08:05:00.000Z',
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

async function openStyleMemoryDetail(page: Page, id: string) {
  try {
    await page.goto(`/workspace/templates/${id}`, { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }
  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
}

/** 等待键盘焦点位于容器内（规则 4：键盘断言前确认 DOM 聚焦） */
async function expectFocusWithin(container: Locator) {
  await expect
    .poll(async () => container.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true)
}

/** 连续 Tab 仍被限制在容器内（焦点循环，背景不可达） */
async function pressTabAndAssertTrap(page: Page, container: Locator, presses: number) {
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press('Tab')
    await expectFocusWithin(container)
  }
}

/** 「More」菜单触发按钮（plan-03 DropdownMenu，可理解名称「More」） */
function moreMenuButton(page: Page) {
  return page.getByRole('button', { name: 'More' })
}

/** 打开「更多」菜单并返回菜单容器 */
async function openMoreMenu(page: Page) {
  await moreMenuButton(page).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  return menu
}

/** 从菜单选择某项（plan-03 roving-focus：ArrowDown 导航 + Enter 触发） */
async function selectMoreMenuItem(page: Page, itemName: RegExp | string) {
  const menu = await openMoreMenu(page)
  const item = menu.getByRole('menuitem', { name: itemName })
  await expect(item).toBeVisible()
  await item.click()
  return item
}

test.describe('plan-05 Style Memory 详情页', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockGenerationList(page)
    await mockCdnImages(page)
  })

  // ─── AC-03 四分区与高级信息 ───

  test('TC-3.1 已验证详情四分区完整：参考图+代表结果并排、来源 Iteration 链接带 focus、风格指纹与规则清单、变量默认值与必填、排除约束与增强方向、完整提示仅高级信息、使用情况', async ({
    page,
  }) => {
    await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY], {
      candidates: { [VERIFIED_MEMORY.id]: VERIFIED_CANDIDATES },
    })

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    // 页面头：返回列表 + 名称 + 状态徽标 + 编辑 / 更多 / 使用这条 Memory
    const header = page.getByTestId('style-memory-detail-header')
    await expect(header).toBeVisible()
    await expect(
      header.getByRole('link', { name: /Back to list/ }).or(header.getByRole('button', { name: /Back to list/ })),
    ).toBeVisible()
    await expect(header.getByText(VERIFIED_MEMORY.name)).toBeVisible()
    await expect(header.getByText('User verified')).toBeVisible()
    await expect(header.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    await expect(moreMenuButton(page)).toBeVisible()
    await expect(header.getByRole('button', { name: /Use this memory/ })).toBeVisible()

    // 验证依据：参考图与代表结果并排 + 双标注 + 来源 Iteration 打开链接（focus 定位）
    const evidence = page.getByTestId('style-memory-detail-evidence')
    await expect(evidence).toBeVisible()
    await expect(evidence.getByText('Evidence')).toBeVisible()
    await expect(evidence.locator('img[src*="references/verified-source"]')).toBeVisible()
    await expect(evidence.locator('img[src*="results/verified-representative"]')).toBeVisible()
    await expect(evidence.getByText('Reference', { exact: true })).toBeVisible()
    await expect(evidence.getByText('Representative result', { exact: true })).toBeVisible()
    await expect(evidence.getByText(/Source iteration/)).toBeVisible()
    const sourceLink = evidence.getByRole('link', { name: /Open/ })
    await expect(sourceLink).toBeVisible()
    await expect(sourceLink).toHaveAttribute(
      'href',
      /\/workspace\/iterations\?focus=gen-source-task-01/,
    )

    // 保留的风格：风格指纹标签 + 核心保留规则清单
    const style = page.getByTestId('style-memory-detail-style')
    await expect(style).toBeVisible()
    await expect(style.getByText('Retained style')).toBeVisible()
    for (const token of VERIFIED_MEMORY.styleTokens) {
      await expect(style.getByText(token)).toBeVisible()
    }
    for (const rule of VERIFIED_MEMORY.retainedRules) {
      await expect(style.getByText(rule)).toBeVisible()
    }

    // 可替换内容：变量默认值逐项展示；空默认值标注「必填」
    const variables = page.getByTestId('style-memory-detail-variables')
    await expect(variables).toBeVisible()
    await expect(variables.getByText('Replaceable')).toBeVisible()
    await expect(variables.getByText('玻璃器皿')).toBeVisible()
    await expect(variables.getByText('窗边桌面')).toBeVisible()
    await expect(variables.getByText('Required')).toBeVisible()

    // 排除约束与增强方向：排除清单 + 增强标签
    const constraints = page.getByTestId('style-memory-detail-constraints')
    await expect(constraints).toBeVisible()
    await expect(constraints.getByText(/Constraints & enhancements/)).toBeVisible()
    for (const constraint of VERIFIED_MEMORY.negativeConstraints) {
      await expect(constraints.getByText(constraint)).toBeVisible()
    }
    for (const hint of VERIFIED_MEMORY.enhancementHints) {
      await expect(constraints.getByText(hint)).toBeVisible()
    }

    // 完整提示：默认不可见，展开高级信息后可见
    const contentOnly = 'fine grain texture'
    await expect(page.getByText(contentOnly)).not.toBeVisible()
    await page.getByRole('button', { name: /full prompt/i }).click()
    await expect(page.getByText(contentOnly)).toBeVisible()

    // 使用情况：最近使用 + 派生次数
    const usage = page.getByTestId('style-memory-detail-usage')
    await expect(usage).toBeVisible()
    await expect(usage.getByText('Never used')).toHaveCount(0)
    await expect(usage.getByText(/Last used/)).toBeVisible()
    await expect(usage.getByText(/2026/)).toBeVisible()
    await expect(usage.getByText(/Derived.*3.*times/)).toBeVisible()
  })

  test('TC-3.2 来源 Iteration 打开链接跳转 iterations 页并定位对应条目', async ({ page }) => {
    await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY], {
      candidates: { [VERIFIED_MEMORY.id]: VERIFIED_CANDIDATES },
    })
    await mockIterationList(page, SOURCE_ITERATIONS)
    await mockIterationDetail(page, SOURCE_ITERATION_DETAIL)

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    const evidence = page.getByTestId('style-memory-detail-evidence')
    await expect(evidence).toBeVisible({ timeout: 15000 })
    await evidence.getByRole('link', { name: /Open/ }).click()

    // 跳转 iterations 页且 focus 定位对应条目（选中态联动，plan-05 Task 8）
    await expect(page).toHaveURL(/\/workspace\/iterations/, { timeout: 15000 })
    const targetItem = page
      .getByTestId('iteration-list-item')
      .filter({ hasText: 'Editorial 柔光初版生成' })
    await expect(targetItem).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('iteration-detail-panel')).toBeVisible({ timeout: 15000 })
  })

  test('TC-3.3 pending detail: evidence section guides representative-result selection, usage shows Never used', async ({ page }) => {
    await mockStyleMemoryDetailCollection(page, [PENDING_MEMORY], {
      candidates: { [PENDING_MEMORY.id]: PENDING_CANDIDATES },
    })

    await openStyleMemoryDetail(page, PENDING_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    const header = page.getByTestId('style-memory-detail-header')
    await expect(header.getByText('Pending verification')).toBeVisible()
    await expect(header.getByText('User verified')).toHaveCount(0)

    // pending 且无代表结果：验证依据区说明引导并提供选择入口；不渲染代表结果图
    const evidence = page.getByTestId('style-memory-detail-evidence')
    await expect(evidence).toBeVisible()
    await expect(evidence.locator('img[src*="references/pending-source"]')).toBeVisible()
    await expect(evidence.locator('img[src*="results/"]')).toHaveCount(0)
    await expect(evidence.getByText(/Choose a representative result from a related completed iteration/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Select representative result/ })).toBeVisible()

    // 使用情况：尚未使用 + 派生 0 次
    const usage = page.getByTestId('style-memory-detail-usage')
    await expect(usage.getByText('Never used')).toBeVisible()
    await expect(usage.getByText(/Derived.*0.*times/)).toBeVisible()
  })

  // ─── AC-05 五连动作 ───

  test('TC-5.1 name-only save: stays User verified, refetched detail has updated name and unchanged representative result', async ({ page }) => {
    const collection = await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY])

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible()

    const nameInput = editDialog.getByLabel(/Name/)
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Editorial Soft Daylight v2')

    // 仅元数据变化：不出现回退提示，明确「stays User verified」
    await expect(editDialog.getByText(/After saving.*Pending verification/)).toHaveCount(0)
    await expect(editDialog.getByText(/stays User verified/)).toBeVisible()

    await editDialog.getByRole('button', { name: /^Save/ }).click()
    await expect(editDialog).toHaveCount(0)

    // PUT 携带新名称；回读详情仍为已验证且代表结果不变
    await expect
      .poll(() => collection.putRequests.at(-1)?.body?.name, { timeout: 10000 })
      .toBe('Editorial Soft Daylight v2')
    await expect(page.getByTestId('style-memory-detail-header')).toBeVisible()
    await expect(page.getByTestId('style-memory-detail-header').getByText('User verified')).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByText('Editorial Soft Daylight v2')).toBeVisible()
    await expect(
      page
        .getByTestId('style-memory-detail-evidence')
        .locator('img[src*="results/verified-representative"]'),
    ).toBeVisible()
  })

  test('TC-5.2 retained-rule change: form shows rollback hint, status rolls back to Pending verification after save', async ({ page }) => {
    const collection = await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY])

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible()

    // 修改第一条核心保留规则（label 关联定位；兼容逐条输入或整组 textarea 实现）
    const firstRuleInput = editDialog.getByLabel(/Retained rules/).first()
    await expect(firstRuleInput).toBeVisible()
    await firstRuleInput.fill('构图改为三分法并保留呼吸感')

    // 规则集合实质变化 → 即时回退提示
    await expect(editDialog.getByText(/After saving.*Pending verification/)).toBeVisible()

    await editDialog.getByRole('button', { name: /^Save/ }).click()
    await expect(editDialog).toHaveCount(0)

    // PUT 携带新规则；服务端回退后回读详情为 pending verification
    await expect
      .poll(() => collection.putRequests.at(-1)?.body?.retainedRules, { timeout: 10000 })
      .toContain('构图改为三分法并保留呼吸感')
    await expect(page.getByTestId('style-memory-detail-header').getByText('Pending verification')).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByTestId('style-memory-detail-header').getByText('User verified')).toHaveCount(0)
  })

  test('TC-5.3 duplicate (More menu): navigates to the copy detail, copy starts as Pending verification with no representative result', async ({ page }) => {
    const collection = await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY])

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    await selectMoreMenuItem(page, /Duplicate/)

    await expect(collection.duplicateRequests).toHaveLength(1)
    await expect(page).toHaveURL(
      new RegExp(`/workspace/templates/${VERIFIED_MEMORY.id}-copy`),
      { timeout: 15000 },
    )

    // 复制品详情：pending verification、名称带 (copy)、无代表结果图，并提示 rename
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('style-memory-detail-header').getByText('Pending verification')).toBeVisible()
    await expect(page.getByText(/Editorial Soft Daylight \(copy\)/)).toBeVisible()
    await expect(
      page.getByTestId('style-memory-detail-evidence').locator('img[src*="results/"]'),
    ).toHaveCount(0)
    await expect(page.getByText(/rename/i)).toBeVisible()
  })

  test('TC-5.4 pending Memory selects representative result: cursor-paged candidates, confirm flips to User verified and shows the new result', async ({
    page,
  }) => {
    const collection = await mockStyleMemoryDetailCollection(
      page,
      [PENDING_MEMORY],
      { candidates: { [PENDING_MEMORY.id]: PENDING_CANDIDATES }, candidatePageSize: 2 },
    )

    await openStyleMemoryDetail(page, PENDING_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: /Select representative result/ }).click()
    const selectorDialog = page.getByRole('dialog')
    await expect(selectorDialog).toBeVisible()

    // 挂载即请求候选；第一页 2 条，「Load earlier」游标翻页后第 3 条可见
    await expect
      .poll(() => collection.candidateQueries.some((query) => query.id === PENDING_MEMORY.id), {
        timeout: 10000,
      })
      .toBe(true)
    await expect(selectorDialog.getByText('纸张肌理 · 顶光 · 大留白')).toBeVisible()
    await expect(selectorDialog.getByText('牛皮纸 · 侧逆光 · 特写')).toBeVisible()
    await expect(selectorDialog.getByText('白卡纸 · 漫射光 · 静物')).toHaveCount(0)

    await selectorDialog.getByRole('button', { name: /Load earlier/ }).click()
    await expect
      .poll(
        () =>
          collection.candidateQueries.filter((query) => query.id === PENDING_MEMORY.id)
            .some((query) => query.cursor),
        { timeout: 10000 },
      )
      .toBe(true)
    await expect(selectorDialog.getByText('白卡纸 · 漫射光 · 静物')).toBeVisible()

    // 单选候选并确认 → POST representative-result { generationTaskId }
    await selectorDialog.getByRole('radio', { name: /纸张肌理/ }).click()
    await selectorDialog.getByRole('button', { name: /Set as representative/ }).click()
    await expect(selectorDialog).toHaveCount(0)

    await expect(collection.representativeResultRequests).toHaveLength(1)
    expect(collection.representativeResultRequests[0]?.body.generationTaskId).toBe(
      'gen-macro-candidate-03',
    )

    // 详情回读：已验证 + 新代表结果展示
    await expect(page.getByTestId('style-memory-detail-header').getByText('User verified')).toBeVisible({
      timeout: 15000,
    })
    await expect(
      page
        .getByTestId('style-memory-detail-evidence')
        .locator('img[src*="results/macro-candidate-03"]'),
    ).toBeVisible()
  })

  test('TC-5.5 替换代表结果：先取消（零请求、原状态与代表结果不变）再确认（展示新代表结果）', async ({
    page,
  }) => {
    const collection = await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY], {
      candidates: { [VERIFIED_MEMORY.id]: VERIFIED_CANDIDATES },
    })

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    // 打开替换入口（已验证详情的代表结果替换动作）
    await page
      .getByRole('button', { name: /Replace representative result|Select representative result/ })
      .first()
      .click()
    const selectorDialog = page.getByRole('dialog')
    await expect(selectorDialog).toBeVisible()

    // 选择新候选后取消：不发任何请求，状态与原代表结果不变
    await selectorDialog.getByRole('radio', { name: /玻璃器皿/ }).click()
    await selectorDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(selectorDialog).toHaveCount(0)
    expect(collection.representativeResultRequests).toHaveLength(0)
    await expect(page.getByTestId('style-memory-detail-header').getByText('User verified')).toBeVisible()
    await expect(
      page
        .getByTestId('style-memory-detail-evidence')
        .locator('img[src*="results/verified-representative"]'),
    ).toBeVisible()

    // 重新打开并确认替换：POST 发出，详情展示新代表结果
    await page
      .getByRole('button', { name: /Replace representative result|Select representative result/ })
      .first()
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('radio', { name: /玻璃器皿/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Set as representative/ }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect(collection.representativeResultRequests).toHaveLength(1)
    expect(collection.representativeResultRequests[0]?.body.generationTaskId).toBe('gen-candidate-new')
    await expect(
      page
        .getByTestId('style-memory-detail-evidence')
        .locator('img[src*="results/editorial-new-representative"]'),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('style-memory-detail-header').getByText('User verified')).toBeVisible()
  })

  // ─── AC-07 删除双分支 ───

  test('TC-7.1 delete confirm dialog is destructive: includes the memory name and the What stays note, backdrop click does not close', async ({
    page,
  }) => {
    await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY])

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    await selectMoreMenuItem(page, /Delete/)
    const deleteDialog = page.getByRole('dialog')
    await expect(deleteDialog).toBeVisible()

    // 确认层说明删除对象与 What stays 的关联内容（PRD 删除线框）
    await expect(deleteDialog.getByText(/Delete Style Memory/)).toBeVisible()
    await expect(deleteDialog.getByText(VERIFIED_MEMORY.name)).toBeVisible()
    await expect(deleteDialog.getByText(/What stays/)).toBeVisible()
    await expect(deleteDialog.getByText(/source reference|source iteration/i)).toBeVisible()

    // destructive：背景点击不关闭
    await page.mouse.click(8, 8)
    await expect(deleteDialog).toBeVisible()

    // 清理：取消关闭
    await deleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(deleteDialog).toHaveCount(0)
  })

  test('TC-7.2 取消删除：回详情原状态（URL 不变、徽标不变、无 DELETE 请求）', async ({ page }) => {
    const collection = await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY])

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })
    const detailUrl = page.url()

    await selectMoreMenuItem(page, /Delete/)
    const deleteDialog = page.getByRole('dialog')
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(deleteDialog).toHaveCount(0)

    // 原详情与原状态保持，未发出 DELETE
    expect(page.url()).toBe(detailUrl)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible()
    await expect(page.getByTestId('style-memory-detail-header').getByText('User verified')).toBeVisible()
    expect(collection.deleteRequests).toHaveLength(0)
  })

  test('TC-7.3 确认删除：回列表恢复原查询、Memory 不可见不可打开，来源 Iteration 仍可访问', async ({
    page,
  }) => {
    const collection = await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY])
    await mockIterationList(page, SOURCE_ITERATIONS)

    // 从带查询条件的列表进入详情（删除确认后需恢复原查询）
    await page.goto(
      `/workspace/templates?search=${encodeURIComponent('Editorial')}&status=user_verified`,
    )
    const card = page.getByTestId('style-memory-card').filter({ hasText: VERIFIED_MEMORY.name })
    await expect(card).toBeVisible({ timeout: 15000 })
    await card
      .getByRole('link', { name: 'View details' })
      .or(card.getByRole('button', { name: 'View details' }))
      .click()
    await expect(page).toHaveURL(new RegExp(`/workspace/templates/${VERIFIED_MEMORY.id}`), {
      timeout: 15000,
    })
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    await selectMoreMenuItem(page, /Delete/)
    const deleteDialog = page.getByRole('dialog')
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click()

    // DELETE 发出 → 回列表并恢复原查询
    await expect(collection.deleteRequests).toEqual([VERIFIED_MEMORY.id])
    await expect(page).toHaveURL(/\/workspace\/templates\?/, { timeout: 15000 })
    await expect(page).toHaveURL(/search=Editorial/)
    await expect(page).toHaveURL(/status=user_verified/)

    // 被删 Memory 不可见
    await expect(page.getByText(VERIFIED_MEMORY.name)).toHaveCount(0)

    // 不可打开：直接访问详情 URL → 「Memory 不存在或已被删除」
    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByText(/does not exist or was deleted/i)).toBeVisible({ timeout: 15000 })

    // 来源 Iteration 仍可访问（ADR-2 引用不复制）
    await page.goto('/workspace/iterations')
    await expect(
      page.getByTestId('iteration-list-item').filter({ hasText: 'Editorial 柔光初版生成' }),
    ).toBeVisible({ timeout: 15000 })
  })

  // ─── AC-09 旧资产缺失分区 ───

  test('TC-9.1 legacy asset detail: pending verification, missing sections annotated in place, remaining content usable, edit and reuse entries usable', async ({
    page,
  }) => {
    await mockStyleMemoryDetailCollection(page, [LEGACY_MEMORY])

    await openStyleMemoryDetail(page, LEGACY_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    // 旧资产不自动继承已验证
    const header = page.getByTestId('style-memory-detail-header')
    await expect(header.getByText('Pending verification')).toBeVisible()
    await expect(header.getByText('User verified')).toHaveCount(0)

    // 验证依据：参考图与来源缺失原位标注（不渲染占位真图）
    const evidence = page.getByTestId('style-memory-detail-evidence')
    await expect(evidence).toBeVisible()
    await expect(evidence.locator('img')).toHaveCount(0)
    await expect(evidence.getByText(/Not yet provided|Missing source/).first()).toBeVisible()

    // 保留的风格：规则与风格指纹为空 → 原位待补充说明
    const style = page.getByTestId('style-memory-detail-style')
    await expect(style).toBeVisible()
    await expect(style.getByText(/Not yet provided|Missing source/).first()).toBeVisible()

    // 其余分区继续可用：变量（空默认值标必填）+ 完整提示 + 使用情况
    const variables = page.getByTestId('style-memory-detail-variables')
    await expect(variables.getByText('Required')).toBeVisible()
    await expect(page.getByText('Legacy draft prompt')).not.toBeVisible()
    await page.getByRole('button', { name: /full prompt/i }).click()
    await expect(page.getByText(/Legacy draft prompt/)).toBeVisible()
    const usage = page.getByTestId('style-memory-detail-usage')
    await expect(usage.getByText('Never used')).toBeVisible()
    await expect(usage.getByText(/Derived.*1.*times/)).toBeVisible()

    // 仍可进入编辑
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible()
    await editDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(editDialog).toHaveCount(0)

    // 仍可进入复用入口（plan-07：接管为复用预检弹层，不直接导航）
    await page.getByRole('button', { name: /Use this memory/ }).click()
    const reusePrecheck = page.getByTestId('reuse-precheck-dialog')
    await expect(reusePrecheck).toBeVisible({ timeout: 15000 })
    await expect(reusePrecheck).toContainText('Early Prompt Draft')
    await expect(page).not.toHaveURL(/templateId=/, { timeout: 5000 })
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible()
  })

  // ─── AC-10 详情错误态 ───

  test('TC-10.1 详情 503：错误态可重试，期间列表入口可用，重试成功恢复详情', async ({ page }) => {
    const retryMock = await mockStyleMemoryDetailRetrySequence(page, VERIFIED_MEMORY, 1)

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)

    // 错误态（StatePresenter failedRecoverable 口径）+ 重试动作
    const failedState = page.locator('section[data-status="failedRecoverable"]')
    await expect(failedState).toBeVisible({ timeout: 15000 })
    await expect(failedState.getByRole('button', { name: /Retry/ })).toBeVisible()

    // 错误态期间列表入口保持可用（AC-10）
    await expect(
      page.getByRole('link', { name: /Back to list/ }).or(page.getByRole('button', { name: /Back to list/ })),
    ).toBeVisible()

    await failedState.getByRole('button', { name: /Retry/ }).click()

    // 重试成功 → 原详情恢复
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(VERIFIED_MEMORY.name)).toBeVisible()
    expect(retryMock.callCount).toBeGreaterThanOrEqual(2)
  })

  // ─── AC-08 键盘连续操作 ───

  test('TC-8.1 键盘编辑→保存：弹层 Tab 循环、Escape 还原触发位置、Enter 完成保存', async ({ page }) => {
    const collection = await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY])

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    // 键盘打开编辑弹层
    const editButton = page.getByRole('button', { name: 'Edit', exact: true })
    await editButton.focus()
    await page.keyboard.press('Enter')

    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible()
    await expectFocusWithin(editDialog)

    // Escape 关闭并还原焦点到触发按钮
    await page.keyboard.press('Escape')
    await expect(editDialog).toHaveCount(0)
    await expect(editButton).toBeFocused()

    // 重新打开：Tab 循环（焦点不出弹层、背景不可达）
    await page.keyboard.press('Enter')
    await expect(editDialog).toBeVisible()
    await expectFocusWithin(editDialog)
    await pressTabAndAssertTrap(page, editDialog, 10)

    // 键盘完成修改并保存
    const nameInput = editDialog.getByLabel(/Name/)
    await nameInput.fill('Editorial Soft Daylight v2')
    const saveButton = editDialog.getByRole('button', { name: /^Save/ })
    await saveButton.focus()
    await page.keyboard.press('Enter')

    await expect(editDialog).toHaveCount(0)
    await expect
      .poll(() => collection.putRequests.at(-1)?.body?.name, { timeout: 10000 })
      .toBe('Editorial Soft Daylight v2')
    await expect(page.getByText('Editorial Soft Daylight v2')).toBeVisible({ timeout: 15000 })
  })

  test('TC-8.2 键盘更多菜单：方向键导航、Escape 还原触发位置、Enter 完成复制', async ({ page }) => {
    const collection = await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY])

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    // 键盘打开菜单：打开即聚焦首项
    const trigger = moreMenuButton(page)
    await trigger.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expectFocusWithin(menu)

    // 方向键在菜单项间循环导航
    await page.keyboard.press('ArrowDown')
    await expectFocusWithin(menu)
    await page.keyboard.press('ArrowUp')
    await expectFocusWithin(menu)

    // Escape 关闭并还原焦点到触发按钮
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // 键盘完成复制：Enter 打开 → ArrowDown 到「复制」→ Enter 触发
    await page.keyboard.press('Enter')
    await expect(menu).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(collection.duplicateRequests).toHaveLength(1)
    await expect(page).toHaveURL(
      new RegExp(`/workspace/templates/${VERIFIED_MEMORY.id}-copy`),
      { timeout: 15000 },
    )
  })

  test('TC-8.3 键盘选择器弹层：Tab 循环、Escape 取消并还原触发位置、零请求', async ({ page }) => {
    const collection = await mockStyleMemoryDetailCollection(
      page,
      [PENDING_MEMORY],
      { candidates: { [PENDING_MEMORY.id]: PENDING_CANDIDATES }, candidatePageSize: 2 },
    )

    await openStyleMemoryDetail(page, PENDING_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    // 键盘打开候选选择器
    const selectButton = page.getByRole('button', { name: /Select representative result/ })
    await selectButton.focus()
    await page.keyboard.press('Enter')

    const selectorDialog = page.getByRole('dialog')
    await expect(selectorDialog).toBeVisible()
    await expectFocusWithin(selectorDialog)

    // Tab 循环：焦点限制在弹层内
    await pressTabAndAssertTrap(page, selectorDialog, 8)

    // Escape 取消：还原焦点到触发按钮，且零请求（AC-05 取消零请求）
    await page.keyboard.press('Escape')
    await expect(selectorDialog).toHaveCount(0)
    await expect(selectButton).toBeFocused()
    expect(collection.representativeResultRequests).toHaveLength(0)

    // 原状态与原代表结果（无）不变
    await expect(page.getByTestId('style-memory-detail-header').getByText('Pending verification')).toBeVisible()
    await expect(
      page.getByTestId('style-memory-detail-evidence').locator('img[src*="results/"]'),
    ).toHaveCount(0)
  })

  test('TC-8.4 键盘删除弹层：Tab 循环、Escape 还原、Enter 确认删除后导航且焦点落页面首要内容', async ({
    page,
  }) => {
    const collection = await mockStyleMemoryDetailCollection(page, [VERIFIED_MEMORY])

    await openStyleMemoryDetail(page, VERIFIED_MEMORY.id)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })

    // 键盘路径打开删除确认：菜单 Enter → ArrowDown×2（编辑→复制→删除）→ Enter
    const trigger = moreMenuButton(page)
    await trigger.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    const deleteDialog = page.getByRole('dialog')
    await expect(deleteDialog).toBeVisible()
    await expectFocusWithin(deleteDialog)

    // Tab 循环：焦点限制在确认层内
    await pressTabAndAssertTrap(page, deleteDialog, 8)

    // Escape 关闭并还原焦点（菜单关闭后还原到触发按钮）
    await page.keyboard.press('Escape')
    await expect(deleteDialog).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // 键盘确认删除 → DELETE → 回列表 → 焦点落页面首要内容
    await page.keyboard.press('Enter')
    await expect(menu).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(deleteDialog).toBeVisible()

    const confirmButton = deleteDialog.getByRole('button', { name: 'Delete', exact: true })
    await confirmButton.focus()
    await page.keyboard.press('Enter')

    await expect(collection.deleteRequests).toEqual([VERIFIED_MEMORY.id])
    await expect(page.getByTestId('style-memory-page')).toBeVisible({ timeout: 15000 })
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const active = document.activeElement
          if (!active) return false
          const listPage = document.querySelector('[data-testid="style-memory-page"]')
          return Boolean(listPage && (listPage === active || listPage.contains(active)))
        }),
      )
      .toBe(true)
  })
})
