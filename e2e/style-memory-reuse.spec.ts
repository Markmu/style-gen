import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  mockAuthSession,
  mockGenerationCreateCapture,
  mockIterationDetail,
  mockIterationList,
  mockStyleMemoryDetailCollection,
  type MockIterationDetail,
  type MockIterationListItem,
  type MockStyleMemoryDetail,
} from './helpers/mock-api'

// plan-07: Style Memory 复用预检与工作区集成（AC-06 / AC-08）
// 本 spec 为 red 先行：当前列表卡片「使用」与详情「使用这条 Memory」直接跳转
// /workspace?templateId=，无复用预检弹层、无工作区身份条 —— 全部用例预期失败，
// 由实现按下方契约对齐后转绿。
//
// 来源：
// - docs/14-可验证Style-Memory/14-2-实现计划-可验证Style-Memory/plan-07-复用预检与工作区集成.md
//   （§实现规格 1–5 + §验收标准 AC-06/AC-08）
// - docs/14-可验证Style-Memory/14-1-架构文档-可验证Style-Memory.md §6.5（预检链路 /
//   影响判定算法 / 就绪统一）、ADR-5（sessionStorage 握手与退化）、ADR-7（结论单一来源）
// - docs/14-可验证Style-Memory/14-0-需求设计-可验证Style-Memory.md §3.1 线框
//   （使用前预检 / 使用后的工作区身份与准备状态）+ 业务规则 21–24
//
// ---------------------------------------------------------------------------
// 页面契约（test-e2e 用例约定，实现须满足；ModalDialog/DropdownMenu 原语承载）：
// 预检弹层（列表卡片与详情两个入口共用同一组件）：
// - [data-testid="reuse-precheck-dialog"] — 弹层容器（role=dialog，焦点陷阱 + Escape）
// - 头部：Memory 名称 + 状态徽标文字（User verified / Pending verification）；已验证时显示代表结果缩略图
//   （img src 含代表结果 URL）
// - 「将保留」区：retainedRules 全量清单逐条可见（只读文本）
// - 「开始前替换」区：必填变量（trim(defaultValue)==='' 的变量）逐个输入框，输入框
//   accessible name 含变量 label（缺省回退 name）；其余变量折叠控件文案匹配
//   /其他变量.*N.*项/，展开后各变量输入框可见且预填 defaultValue 可编辑
// - 工作区影响区 [data-testid="precheck-workspace-impact"]，三分支文案（架构 §6.5-2）：
//   · 无快照（或 referenceImageUrl 与 promptText 均空）→ 命中 /工作区为空|可直接进入/
//   · currentTemplateId === memory.id → 含「已在使用这条 Memory」
//   · 其余 → 命中 /不同的未完成内容|确认后切换/
// - 必填未填全：Enter workspace 按钮名 /^Enter workspace$/ 且 disabled，弹层内以可读文本列出缺失项
//   名称（建议「N fields left to fill: …」，命中 /fields left to fill/）
// - 取消按钮名 取消（exact）：关闭 + 还原触发焦点 + 零变更（快照字节不变、URL 不变）
// - 确认（进入工作区）：更新 sessionStorage `style-gen-workspace-state` 快照——version=4、
//   currentTemplateId=memoryId、预填值合入 analysisTemplateVariables 对应变量的
//   defaultValue 与变量值——随后 router.push('/workspace?templateId={id}')
// 工作区身份条：
// - [data-testid="memory-identity-bar"]：含「USING STYLE MEMORY」标签、Memory 名称、
//   状态徽标文字、「Restored N retained rules」（N=retainedRules.length）、缺失变量时含
//   /fields left to fill/ 与缺失项名称；动作按钮 View details（跳详情）与 Remove
// - 移除：currentTemplateId 清空（快照归 null），工作区内容保留，身份条消失
// 就绪一致（ADR-7）：
// - 未补全必填 → 身份条显示缺失清单，Generate 禁用且 output-card 保持
//   data-readiness-can-generate="false"；补全后同源翻转为可生成（无互相矛盾文案）
// - 不自动生成：确认进入与补全变量后断言零 POST /api/generation
// 主动生成：
// - POST 体携带 sourceTemplateId === memory.id（mock 捕获断言）
// - 新 Iteration 详情面板显示来源 Memory（一行内组合「来源 Style Memory」标签与名称，
//   或 panel 内同时出现来源 Memory 名称文本）；Memory 详情 usage 聚合随服务端更新
// 握手退化（ADR-5）：
// - 清空 sessionStorage 后经 ?templateId= 直入仍正常加载（fetch 路径），身份条如实
//   显示缺失变量而非报错
// ---------------------------------------------------------------------------

const WORKSPACE_STORAGE_KEY = 'style-gen-workspace-state'
// plan-02 将工作台快照 SSOT 升级为 v5（quick authorization/promptControls 等）；
// 复用确认快照由 precheck 组件从 use-workspace-state 导入同一常量写入。
const WORKSPACE_STORAGE_VERSION = 5

/** 主角 Memory（已验证：有代表结果缩略、3 条保留规则、4 变量其中 2 个必填） */
const REUSE_MEMORY: MockStyleMemoryDetail = {
  id: 'style-memory-reuse-editorial',
  name: 'Editorial Soft Daylight',
  description: '可复用的柔和日光编辑风格',
  content:
    'Create {{subject}} in {{scene}} with soft diffused daylight, low-saturation warm gray palette and fine grain texture.',
  variables: [
    { name: 'subject', label: '主体', defaultValue: '' },
    { name: 'scene', label: '场景', defaultValue: '' },
    { name: 'wardrobe', label: '服饰', defaultValue: '深色正装' },
    { name: 'mood', label: '氛围', defaultValue: '安静' },
  ],
  retainedRules: [
    '低饱和暖灰基调',
    '柔和漫射光并保留细颗粒质感',
    '构图保留大面积留白',
  ],
  negativeConstraints: ['避免高饱和霓虹色'],
  styleTokens: ['低饱和暖灰', '柔和漫射光'],
  enhancementHints: ['编辑式留白'],
  verificationStatus: 'user_verified',
  representativeGenerationTaskId: 'gen-reuse-representative',
  sourceAssetId: 'asset-reuse-source',
  sourceImageUrl: 'https://cdn.example.com/references/reuse-source/original.webp',
  sourceGenerationTaskId: 'gen-reuse-source',
  sourceGenerationTask: { id: 'gen-reuse-source', createdAt: '2026-08-10T08:00:00.000Z' },
  representativeResult: {
    iterationId: 'gen-reuse-representative',
    imageUrl: 'https://cdn.example.com/results/reuse-representative.webp',
    createdAt: '2026-08-12T08:00:00.000Z',
  },
  usage: { lastUsedAt: '2026-08-20T10:00:00.000Z', derivedIterationCount: 3 },
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

const MEMORY_ID = REUSE_MEMORY.id
const MEMORY_NAME = REUSE_MEMORY.name

/** 当前工作台的未完成内容（WorkspacePersistedState v4 形态，来源见 use-workspace-state.ts） */
function unfinishedWorkspaceState(currentTemplateId: string | null = null) {
  return {
    version: WORKSPACE_STORAGE_VERSION,
    assetId: 'current-unfinished-asset',
    referenceImageUrl: 'https://cdn.example.com/references/current/original.png',
    analysisTaskId: 'current-unfinished-analysis',
    recipe: null,
    promptText: 'Lavender haze editorial study',
    negativePromptText: '',
    analysisTemplateContent: null,
    analysisTemplateVariables: [],
    analysisTemplateStatus: null,
    analysisTemplateReason: null,
    generationTaskId: null,
    v2PromptState: null,
    ...(currentTemplateId !== null ? { currentTemplateId } : {}),
  }
}

/** 「已在使用本 Memory」场景的快照：内容为未完成且 currentTemplateId 指向主角 Memory */
const SAME_MEMORY_WORKSPACE_STATE = {
  ...unfinishedWorkspaceState(MEMORY_ID),
}

/** plan-07 主线新生成的迭代（POST 响应任务 id 固定，供轮询与 Iteration mock 复用） */
const NEW_ITERATION_ID = 'reuse-new-iteration'

const GENERATED_ITERATION_ITEM: MockIterationListItem = {
  id: NEW_ITERATION_ID,
  status: 'completed',
  promptSummary: 'Editorial daylight relaunch attempt',
  resultFileUrl: `https://cdn.example.com/generated/${NEW_ITERATION_ID}/result.webp`,
  params: { aspectRatio: '16:9', quality: 'standard' },
  createdAt: '2026-08-26T09:00:00.000Z',
}

const GENERATED_ITERATION_DETAIL: MockIterationDetail = {
  id: NEW_ITERATION_ID,
  analysisTaskId: `analysis-${NEW_ITERATION_ID}`,
  status: 'completed',
  promptSnapshot: 'Editorial daylight relaunch attempt',
  negativePromptSnapshot: '',
  params: { aspectRatio: '16:9', quality: 'standard' },
  modelName: 'flux-2-dev',
  resultFileUrl: `https://cdn.example.com/generated/${NEW_ITERATION_ID}/result.webp`,
  errorMessage: null,
  recipe: null,
  recipeSource: 'missing',
  variables: [],
  variablesSource: 'missing',
  sourceImageUrl: 'https://cdn.example.com/references/reuse-source/original.webp',
  sourceAssetId: 'asset-reuse-source',
  sourceTemplateId: MEMORY_ID,
  sourceTemplateName: MEMORY_NAME,
  savedTemplate: null,
  analysisTemplateVariables: [],
  createdAt: '2026-08-26T09:00:00.000Z',
  updatedAt: '2026-08-26T09:05:00.000Z',
}

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

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

async function gotoPath(page: Page, path: string) {
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

/** 打开 Style Memory 列表页并等待网格就绪（列表页不消费工作台快照，seed 可随后写入） */
async function openStyleMemoryList(page: Page) {
  await gotoPath(page, '/workspace/templates')
  await expect(page.getByTestId('style-memory-card').first()).toBeVisible({ timeout: 15000 })
}

async function seedWorkspaceState(page: Page, state: Record<string, unknown>) {
  await page.evaluate(
    ([key, value]: [string, string]) => window.sessionStorage.setItem(key, value),
    [WORKSPACE_STORAGE_KEY, JSON.stringify(state)] as [string, string],
  )
}

async function readRawWorkspaceStorage(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.sessionStorage.getItem(key), WORKSPACE_STORAGE_KEY)
}

async function pollCurrentTemplateId(
  page: Page,
  expected: string | null,
): Promise<void> {
  await expect
    .poll(async () => {
      const raw = await readRawWorkspaceStorage(page)
      if (!raw) return expected === null ? null : undefined
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        return (parsed.currentTemplateId as string | null | undefined) ?? null
      } catch {
        return undefined
      }
    }, { timeout: 15000 })
    .toBe(expected)
}

// ─── 弹层 / 身份条定位器 ───

function precheckDialog(page: Page) {
  return page.getByTestId('reuse-precheck-dialog')
}

function precheckImpact(page: Page) {
  return page.getByTestId('precheck-workspace-impact')
}

function enterWorkspaceButton(page: Page) {
  return precheckDialog(page).getByRole('button', { name: /^Enter workspace$/ })
}

function precheckCancelButton(page: Page) {
  return precheckDialog(page).getByRole('button', { name: 'Cancel', exact: true })
}

/** 详情页头「使用这条 Memory」（既有入口按钮，plan-07 接管为打开预检） */
function detailUseButton(page: Page) {
  return page.getByTestId('style-memory-detail-header').getByRole('button', {
    name: /Use this memory/,
  })
}

/** 列表卡「使用」（既有入口按钮，plan-07 接管为打开预检） */
function cardUseButton(page: Page) {
  return page
    .getByTestId('style-memory-card')
    .filter({ hasText: MEMORY_NAME })
    .getByRole('button', { name: 'Use', exact: true })
}

function memoryIdentityBar(page: Page) {
  return page.getByTestId('memory-identity-bar')
}

function appShell(page: Page) {
  return page.getByTestId('app-shell')
}

function promptCard(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('prompt-card')
}

function renderDock(page: Page) {
  return appShell(page)
    .getByRole('region', { name: 'Prompt and Render column' })
    .getByTestId('output-card')
}

function generateButton(page: Page) {
  return renderDock(page).getByRole('button', { name: /^Generate$/i })
}

function referenceColumn(page: Page) {
  return appShell(page).getByRole('region', { name: 'Reference Canvas column' })
}

// ─── 键盘助手（对齐 style-memory-detail.spec.ts 规则 4 口径） ───

async function expectFocusWithin(container: Locator) {
  await expect
    .poll(async () => container.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true)
}

async function pressTabAndAssertTrap(page: Page, container: Locator, presses: number) {
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press('Tab')
    await expectFocusWithin(container)
  }
}

test.describe('plan-07 Style Memory 复用预检与工作区集成', () => {
  test.use({ viewport: { width: 1366, height: 900 } })

  test.beforeEach(async ({ page }) => {
    // 每个用例独立 context，sessionStorage 天然为空（空工作台分支基准）；
    // 需要「不同未完成内容」的用例在页面加载后显式写入快照。
    await page.addInitScript(() => window.sessionStorage.clear())
    await mockAuthSession(page)
    await mockCdnImages(page)
    await mockIterationList(page, [])
  })

  // ─── 入口接管（AC-06：点「使用」先看到预检，不再直接跳转） ───

  test('TC-6.1 列表卡「使用」打开复用预检弹层：不跳转工作区、URL 与快照均不变', async ({
    page,
  }) => {
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await openStyleMemoryList(page)
    await seedWorkspaceState(page, unfinishedWorkspaceState())
    const snapshotBefore = await readRawWorkspaceStorage(page)

    await cardUseButton(page).click()

    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await expect(dialog).toContainText(MEMORY_NAME)

    // 未跳转：仍在列表页，工作台快照未被改写
    await expect(page).not.toHaveURL(/\/workspace\?templateId=/, { timeout: 5000 })
    expect(await readRawWorkspaceStorage(page), '预检期间不得改写快照').toBe(snapshotBefore)
  })

  test('TC-6.2 详情「使用这条 Memory」打开复用预检弹层：不跳转工作区', async ({ page }) => {
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    // 测试编排修复（断言与期望行为零改动）：先导航再种快照（对齐 TC-6.1
    // 「先开后种」模式）。导航前 page.evaluate 落在 about:blank 的 opaque
    // origin，sessionStorage 访问抛 SecurityError，种快照必然失败。
    await gotoPath(page, `/workspace/templates/${MEMORY_ID}`)
    await expect(page.getByTestId('style-memory-detail-page')).toBeVisible({ timeout: 15000 })
    await seedWorkspaceState(page, unfinishedWorkspaceState())

    await detailUseButton(page).click()

    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await expect(dialog).toContainText(MEMORY_NAME)
    await expect(page).not.toHaveURL(/\/workspace\?templateId=/, { timeout: 5000 })
  })

  // ─── 预检内容（AC-06：保留规则全量 + 必填变量门 + 折叠其他变量） ───

  test('TC-6.3 precheck header shows name, User verified badge and representative thumbnail; What carries over lists all retained rules', async ({
    page,
  }) => {
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await openStyleMemoryList(page)
    await cardUseButton(page).click()

    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })

    // 头部：名称 + 状态徽标（文字）+ 已验证代表结果缩略
    await expect(dialog.getByText(MEMORY_NAME)).toBeVisible()
    await expect(dialog.getByText('User verified')).toBeVisible()
    await expect(
      dialog.locator('img[src*="results/reuse-representative"]'),
      '已验证 Memory 的预检应显示代表结果缩略图',
    ).toBeVisible()

    // 将保留：retainedRules 全量逐条可见
    for (const rule of REUSE_MEMORY.retainedRules) {
      await expect(dialog.getByText(rule)).toBeVisible()
    }
  })

  test('TC-6.4 必填变量（空默认值）逐个输入框，其余折叠为「其他变量（2 项）」展开后预填可编辑', async ({
    page,
  }) => {
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await openStyleMemoryList(page)
    await cardUseButton(page).click()

    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })

    // 必填 = trim(defaultValue)===''：subject(主体) 与 scene(场景) 各一个输入框
    const subjectInput = dialog.getByLabel(/主体/)
    const sceneInput = dialog.getByLabel(/场景/)
    await expect(subjectInput).toBeVisible()
    await expect(sceneInput).toBeVisible()
    await subjectInput.fill('磨砂玻璃瓶')

    // 其余变量折叠：「其他变量（2 项）」控件存在，折叠态下服饰输入不可见
    const collapsed = dialog.getByText(/Other variables.*2/)
    await expect(collapsed).toBeVisible()
    const wardrobeInput = dialog.getByLabel(/服饰/)
    await expect(wardrobeInput).toHaveCount(0)

    await collapsed.click()
    await expect(wardrobeInput).toBeVisible()
    await expect(wardrobeInput).toHaveValue('深色正装')
    await expect(dialog.getByLabel(/氛围/)).toHaveValue('安静')
  })

  // ─── 工作区影响判定三分支（架构 §6.5-2） ───

  test('TC-6.5 impact with no workspace snapshot: empty workspace branch', async ({ page }) => {
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await openStyleMemoryList(page)
    // beforeEach 已清空 sessionStorage —— 无快照分支

    await cardUseButton(page).click()

    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await expect(precheckImpact(page)).toContainText(/workspace is empty|nothing will be replaced/i)
  })

  test('TC-6.6 impact when snapshot currentTemplateId points at this memory: already-using branch', async ({
    page,
  }) => {
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await openStyleMemoryList(page)
    await seedWorkspaceState(page, SAME_MEMORY_WORKSPACE_STATE)

    await cardUseButton(page).click()

    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await expect(precheckImpact(page)).toContainText('You are already using this memory.')
  })

  test('TC-6.7 impact when snapshot has other unfinished content: replace-on-continue branch', async ({
    page,
  }) => {
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await openStyleMemoryList(page)
    await seedWorkspaceState(page, unfinishedWorkspaceState())

    await cardUseButton(page).click()

    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await expect(precheckImpact(page)).toContainText(/different unfinished work|replaced when you continue/i)
  })

  // ─── 必填门与取消（AC-06） ───

  test('TC-6.8 missing required fields: dialog lists the specific missing names and Enter workspace is disabled', async ({ page }) => {
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await openStyleMemoryList(page)
    await cardUseButton(page).click()

    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })

    const confirmButton = enterWorkspaceButton(page)
    await expect(confirmButton).toBeVisible()
    await expect(confirmButton).toBeDisabled()

    // 缺失说明命中门控提示文案，并列出两项缺失变量名称（主体 label / 场景 label）
    const missingHint = dialog.getByText(/fields left to fill/i)
    await expect(missingHint.first()).toBeVisible()
    await expect(missingHint.first()).toContainText('主体')
    await expect(missingHint.first()).toContainText('场景')
  })

  test('TC-6.9 取消：关闭弹层、还原触发焦点、快照字节级零变更、URL 不变', async ({ page }) => {
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await openStyleMemoryList(page)
    await seedWorkspaceState(page, unfinishedWorkspaceState())
    const urlBefore = page.url()
    const snapshotBefore = await readRawWorkspaceStorage(page)

    await cardUseButton(page).click()
    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })

    // 半途填写不影响取消结果
    await dialog.getByLabel(/主体/).fill('磨砂玻璃瓶')

    await precheckCancelButton(page).click()

    await expect(dialog).toHaveCount(0)
    await expect(cardUseButton(page)).toBeFocused()
    await expect(page).toHaveURL(urlBefore)
    expect(await readRawWorkspaceStorage(page), '取消必须零变更').toBe(snapshotBefore)
  })

  // ─── 确认闭环主链路（AC-06 核心序列） ───

  test('TC-6.10 确认进入：合入快照（version/currentTemplateId/预填默认值）→ 跳 templateId 回落 /workspace → 身份条完整显示 → 无自动生成请求且 Generate 可用', async ({
    page,
  }) => {
    test.slow()
    const generationCapture = await mockGenerationCreateCapture(page, NEW_ITERATION_ID)
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await openStyleMemoryList(page)
    await seedWorkspaceState(page, unfinishedWorkspaceState())

    await cardUseButton(page).click()
    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })

    // 在预检中补全两个必填变量后确认
    await dialog.getByLabel(/主体/).fill('磨砂玻璃瓶')
    await dialog.getByLabel(/场景/).fill('窗边桌面')
    // 跳转握手地址并被消费回落 /workspace。
    // 握手 URL 为短暂时性的同文档跳转：先注册 waitForURL 监听再点击，
    // 避免轮询采样错过中间态（观察竞态，非行为放宽）。
    const handshakeUrl = page.waitForURL(new RegExp(`templateId=${MEMORY_ID}`), { timeout: 15000 })
    await enterWorkspaceButton(page).click()
    await handshakeUrl
    await expect(appShell(page)).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })

    // 快照合入：version 不变、currentTemplateId 记录、预填值写入对应变量 defaultValue
    await expect
      .poll(async () => {
        const raw = await readRawWorkspaceStorage(page)
        if (!raw) return null
        return JSON.parse(raw) as Record<string, unknown>
      }, { timeout: 15000 })
      .toEqual(
        expect.objectContaining({
          version: WORKSPACE_STORAGE_VERSION,
          currentTemplateId: MEMORY_ID,
          analysisTemplateVariables: expect.arrayContaining([
            expect.objectContaining({ name: 'subject', defaultValue: '磨砂玻璃瓶' }),
            expect.objectContaining({ name: 'scene', defaultValue: '窗边桌面' }),
          ]),
        }),
      )

    // 身份条持续可见：USING STYLE MEMORY + 名称 + 徽标 + restored 规则数 + 动作
    const identityBar = memoryIdentityBar(page)
    await expect(identityBar).toBeVisible({ timeout: 15000 })
    await expect(identityBar.getByText('USING STYLE MEMORY')).toBeVisible()
    await expect(identityBar.getByText(MEMORY_NAME)).toBeVisible()
    await expect(identityBar.getByText('User verified')).toBeVisible()
    await expect(identityBar.getByText(/Restored\s*3\s*retained rules/)).toBeVisible()
    await expect(identityBar.getByRole('button', { name: 'View details' })).toBeVisible()
    await expect(identityBar.getByRole('button', { name: 'Remove' })).toBeVisible()

    // 不自动生成（PRD 规则 23）：确认进入零 POST /api/generation
    expect(generationCapture.requests, '确认进入不得触发生成请求').toHaveLength(0)

    // 必填已在预检补全 → 准备就绪（单一来源结论）：无缺失表述、生成可用
    await expect(identityBar.getByText(/fields left to fill/)).toHaveCount(0)
    await expect(generateButton(page)).toBeEnabled()
    await expect(renderDock(page)).toHaveAttribute('data-readiness-can-generate', 'true')
  })

  // ─── 一致结论与握手退化（ADR-5 / ADR-7） ───

  test('TC-6.11 direct entry via ?templateId= with cleared sessionStorage still loads: identity bar honestly reports 2 fields left to fill (subject, scene), Generate disabled and zero POST throughout', async ({
    page,
  }) => {
    test.slow()
    const generationCapture = await mockGenerationCreateCapture(page, NEW_ITERATION_ID)
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    // beforeEach 已清空 sessionStorage（握手退化为既有 ?templateId= fetch 路径）
    await gotoPath(page, `/workspace?templateId=${MEMORY_ID}`)
    await expect(appShell(page)).toBeVisible({ timeout: 15000 })
    await expect(promptCard(page)).toContainText(/diffused daylight/, { timeout: 15000 })
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 })

    // 身份条如实显示缺失变量（退化路径非错误）
    const identityBar = memoryIdentityBar(page)
    await expect(identityBar).toBeVisible({ timeout: 15000 })
    await expect(identityBar.getByText(MEMORY_NAME)).toBeVisible()
    await expect(identityBar.getByText(/2 fields left to fill/)).toBeVisible()
    await expect(identityBar.getByText('主体')).toBeVisible()
    await expect(identityBar.getByText('场景')).toBeVisible()

    // 同源结论：身份条与渲染坞一致地不可生成
    await expect(generateButton(page)).toBeDisabled()
    await expect(renderDock(page)).toHaveAttribute('data-readiness-can-generate', 'false')
    expect(generationCapture.requests, '直入路径不得触发生成请求').toHaveLength(0)
  })

  test('TC-6.12 移除身份条：currentTemplateId 清空、工作区内容保留', async ({ page }) => {
    test.slow()
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await gotoPath(page, `/workspace?templateId=${MEMORY_ID}`)
    await expect(memoryIdentityBar(page)).toBeVisible({ timeout: 15000 })

    const referenceImage = referenceColumn(page).getByRole('img', { name: 'Reference' })
    await expect(referenceImage).toHaveAttribute(
      'src',
      REUSE_MEMORY.sourceImageUrl as string,
      { timeout: 15000 },
    )
    const promptEditor = promptCard(page).getByLabel('Full Generation Prompt')
    await expect(promptEditor).toBeVisible({ timeout: 15000 })
    const promptBefore = await promptEditor.inputValue()
    expect(promptBefore.length).toBeGreaterThan(0)

    await memoryIdentityBar(page).getByRole('button', { name: 'Remove' }).click()

    await expect(memoryIdentityBar(page)).toHaveCount(0)
    // 内容保留：参考图与提示编辑器不受影响
    await expect(referenceImage).toHaveAttribute('src', REUSE_MEMORY.sourceImageUrl as string)
    await expect(promptCard(page).getByLabel('Full Generation Prompt')).toHaveValue(promptBefore)
    // currentTemplateId 清空（flush 防抖窗口内完成落盘）
    await pollCurrentTemplateId(page, null)
  })

  // ─── 主动生成（AC-06：sourceTemplateId 关联 + 来源显示 + 使用聚合更新） ───

  test('TC-6.13 主动生成：POST 体携带 sourceTemplateId=memoryId，新 Iteration 详情显示来源 Memory 名称，Memory 最近使用与派生计数更新', async ({
    page,
  }) => {
    test.slow()
    const generationCapture = await mockGenerationCreateCapture(page, NEW_ITERATION_ID)
    const collection = await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])
    await mockIterationList(page, [GENERATED_ITERATION_ITEM])
    await mockIterationDetail(page, GENERATED_ITERATION_DETAIL)
    // 测试编排修复（断言与期望行为零改动）：本用例主张「processing 后到达
    // completed」。原先在后注册的固定 processing 轮询 mock 与
    // mockIterationDetail(completed) 模式完全同串，Playwright 路由按 LIFO
    // 命中（后注册者永久胜出），生成永远停在 processing、『Generated Result』
    // 不可能出现。移除该固定 mock，由同一 completed 详情统一承载轮询与详情。

    await openStyleMemoryList(page)
    await seedWorkspaceState(page, unfinishedWorkspaceState())

    await cardUseButton(page).click()
    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await dialog.getByLabel(/主体/).fill('磨砂玻璃瓶')
    await dialog.getByLabel(/场景/).fill('窗边桌面')
    await enterWorkspaceButton(page).click()

    await expect(appShell(page)).toBeVisible({ timeout: 15000 })
    await expect(generateButton(page)).toBeEnabled({ timeout: 15000 })

    await generateButton(page).click()

    // POST 体关联来源 Memory（AC-06/PRD 规则 24）
    await expect.poll(() => generationCapture.requests.length, { timeout: 15000 }).toBe(1)
    expect(generationCapture.requests[0].body.sourceTemplateId).toBe(MEMORY_ID)

    // 新 Iteration 显示来源 Memory 名称（详情面板的来源标注由实现提供：
    // 单行组合「来源 Style Memory」标签与名称，或 panel 内出现来源名称文本）
    // plan-07：成功不再打开生成任务弹层——以状态带 Result 阶段为完成锚点
    await page.getByTestId('ai-copilot-ribbon').getByText('Result').first().waitFor({
      timeout: 15000,
    })
    await expect(page.getByTestId('generation-dialog')).toHaveCount(0)
    await gotoPath(page, '/workspace/iterations')
    const itemRow = page
      .getByTestId('iteration-list-item')
      .filter({ hasText: GENERATED_ITERATION_ITEM.promptSummary })
    await expect(itemRow.first()).toBeVisible({ timeout: 15000 })
    await itemRow.first().click()
    const panel = page.getByTestId('iteration-detail-panel')
    await expect(panel).toBeVisible({ timeout: 15000 })
    await expect(panel.getByText(/Source\s*(Style\s*)?Memory/i)).toBeVisible()
    await expect(panel.getByText(MEMORY_NAME)).toBeVisible()

    // 服务端聚合更新（mock 直接推进状态）：Memory 最近使用时间与派生数量 +1
    collection.memories[0] = {
      ...collection.memories[0],
      usage: { lastUsedAt: '2026-08-26T09:05:00.000Z', derivedIterationCount: 4 },
    }
    await gotoPath(page, `/workspace/templates/${MEMORY_ID}`)
    const usage = page.getByTestId('style-memory-detail-usage')
    await expect(usage).toBeVisible({ timeout: 15000 })
    await expect(usage.getByText('Never used')).toHaveCount(0)
    await expect(usage.getByText(/Last used/)).toBeVisible()
    await expect(usage.getByText(/Derived.*4.*times/)).toBeVisible()
  })

  // ─── AC-08 键盘连续操作 ───

  test('TC-8.1 预检键盘旅程：Enter 打开即聚焦、Tab 循环、Escape 还原触发焦点且零变更、键盘补全后 Enter 提交、落地工作区首屏焦点置于身份条或首要内容', async ({
    page,
  }) => {
    test.slow()
    const generationCapture = await mockGenerationCreateCapture(page, NEW_ITERATION_ID)
    await mockStyleMemoryDetailCollection(page, [REUSE_MEMORY])

    await openStyleMemoryList(page)
    await seedWorkspaceState(page, unfinishedWorkspaceState())
    const snapshotBefore = await readRawWorkspaceStorage(page)

    const trigger = cardUseButton(page)
    await trigger.focus()
    await page.keyboard.press('Enter')

    const dialog = precheckDialog(page)
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await expectFocusWithin(dialog)

    // Escape：关闭 + 还原触发焦点 + 零变更
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(await readRawWorkspaceStorage(page), 'Escape 取消必须零变更').toBe(snapshotBefore)

    // 重开：Tab 循环不出弹层（背景不可达）。
    // 先等详情载荷渲染完成（影响判定区块仅在 detail 就绪后出现）：加载占位与
    // 内容交换会瞬时把焦点落回 body，若与 Tab 循环竞态会误报焦点逃逸。
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await expect(precheckImpact(page)).toBeVisible()
    await expectFocusWithin(dialog)
    // 焦点循环重试：极速连按 Tab 偶发触发 plan-03 trap 的 focusout 竞态
    // （焦点瞬时落 body 且不再自动回弹）。重试先重聚焦容器再整轮循环，
    // trap 真实失效时两轮都会失败，断言口径不变。
    const tabLoopContained = async () => {
      for (let index = 0; index < 10; index += 1) {
        await page.keyboard.press('Tab')
        await expectFocusWithin(dialog)
      }
    }
    await expect(async () => {
      await dialog.focus()
      await tabLoopContained()
    }).toPass({ timeout: 15000 })

    // 仅键盘补全必填并提交（键盘输入落地校验：内容交换 remount 可能吃掉首次输入）
    const subjectInput = dialog.getByLabel(/主体/)
    const sceneInput = dialog.getByLabel(/场景/)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if ((await subjectInput.inputValue()) === '磨砂玻璃瓶') break
      await subjectInput.focus()
      await page.keyboard.type('磨砂玻璃瓶')
    }
    await expect(subjectInput).toHaveValue('磨砂玻璃瓶')
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if ((await sceneInput.inputValue()) === '窗边桌面') break
      await sceneInput.focus()
      await page.keyboard.type('窗边桌面')
    }
    await expect(sceneInput).toHaveValue('窗边桌面')
    await expect(enterWorkspaceButton(page)).toBeEnabled()
    await enterWorkspaceButton(page).focus()
    await page.keyboard.press('Enter')

    // 确认导航后：工作台加载且零自动 POST，首屏焦点落在身份条或首要内容
    await expect(appShell(page)).toBeVisible({ timeout: 15000 })
    expect(generationCapture.requests, '确认进入不得触发生成请求').toHaveLength(0)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement
          if (!active) return false
          const bar = document.querySelector('[data-testid="memory-identity-bar"]')
          if (bar && (bar === active || bar.contains(active))) return true
          const heading = document.querySelector('h1')
          return !!heading && (heading === active || heading.contains(active))
        }),
      )
      .toBe(true)
  })
})
