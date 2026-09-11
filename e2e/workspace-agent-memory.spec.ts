import { test, expect, type Page, type Route } from '@playwright/test';
import { mockAuthSession, mockAgentConversation, mockCdnImages } from './helpers/mock-api';
import type { WorkspaceDraft } from '../src/lib/workspace/contracts';
import v2 from './fixtures/api-responses/analysis-v2-completed.json';
import { ulid } from 'ulid';
import { workspaceAuthCookie } from './helpers/auth';
import { workspaceTestPool, seedWorkspaceSources, cleanupWorkspaceUser } from './helpers/workspace-db';

/**
 * plan-10 风格记忆保存与回执恢复（UI mock 部分）。
 *
 * - AC-17：工作区草稿保存携带方向 requestKey，目标为新建 Memory 且保持
 *   pending verification（不带代表结果），保存后留在当前方向。
 * - AC-18：保存响应未知时先按同键查命令回执（只读），确认不存在后按原键
 *   重试；已保存但回读失败只重试读取，不重复提交。
 * - AC-21：未知保存后刷新/恢复不自动重放保存；表单与待提交键本机持久；
 *   服务端已有回执时只读确认，不抹去已保存 ID。
 *
 * UI 用例在 pnpm e2e（AUTH_REQUIRED=false）执行；真实 DB 运行器启用认证，
 * 页面会被重定向，故互斥跳过，仅执行真实 API 用例。
 */
const uiSuite = process.env.WORKSPACE_TEST_DATABASE_URL ? test.skip : test;

interface CapturedSave {
  url: string;
  body: Record<string, unknown>;
}

const WORKING_DRAFT: WorkspaceDraft = {
  control: null,
  customPrompt: 'A quiet studio with amber light',
  negativePromptText: 'no text',
  params: { model: 'flux-2-dev', quality: 'standard', aspectRatio: '1:1' },
  constraints: [],
  aspectRatioSource: 'user',
};

/** POST /api/templates 捕获 + 可脚本化响应（abort 模拟响应丢失） */
async function mockMemoryCreate(
  page: Page,
  script: Array<{ status?: number; body?: object; abort?: boolean }>,
) {
  const requests: CapturedSave[] = [];
  let index = 0;
  await page.route('**/api/templates', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    requests.push({
      url: route.request().url(),
      body: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
    });
    const step = script[Math.min(index, script.length - 1)];
    index++;
    if (step.abort) {
      await route.abort('failed');
      return;
    }
    const body = {
      id: 'draft-memory-1',
      name: 'Saved draft memory',
      content: '',
      variables: [],
      ...(step.body ?? {}),
    };
    await route.fulfill({
      status: step.status ?? 201,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return { requests };
}

/** 回执查询捕获：GET /api/workspace/directions/{id}/events?requestKey=memory:* */
async function mockMemoryReceiptQuery(page: Page, response: (key: string) => object) {
  const queriedKeys: string[] = [];
  await page.route(
    (url: URL) =>
      url.pathname.endsWith('/events') &&
      (url.searchParams.get('requestKey') ?? '').startsWith('memory:'),
    async (route) => {
      const key = new URL(route.request().url()).searchParams.get('requestKey') ?? '';
      queriedKeys.push(key);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response(key)) });
    },
  );
  return { queriedKeys };
}

async function openDraftSaveDialog(page: Page) {
  await page.getByRole('tablist', { name: 'Workspace inspector' }).getByRole('tab', { name: 'Prompt', exact: true }).click();
  await page.getByRole('button', { name: 'Save as Style Memory', exact: true }).click();
  await expect(page.getByTestId('save-style-memory-dialog')).toBeVisible();
}

uiSuite('AC-17 draft save posts an explicit direction requestKey and stays a pending target', async ({ page }) => {
  await mockAuthSession(page);
  await mockAgentConversation(page, { draft: WORKING_DRAFT });
  await mockCdnImages(page);
  const save = await mockMemoryCreate(page, [
    { status: 201, body: { id: 'draft-memory-1', name: 'Saved draft memory' } },
  ]);
  await page.route('**/api/templates?**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { items: [], hasMore: false, nextCursor: null } });
    } else {
      await route.continue();
    }
  });
  await page.goto('/workspace?directionId=conversation-direction');
  await openDraftSaveDialog(page);
  await page.getByLabel('Name', { exact: true }).fill('Amber studio memory');
  await page.getByRole('button', { name: 'Save Style Memory', exact: true }).click();
  await expect.poll(() => save.requests.length).toBe(1);
  const body = save.requests[0].body;
  expect(body.directionId).toBe('conversation-direction');
  expect(typeof body.requestKey).toBe('string');
  expect(String(body.requestKey)).toMatch(/^[A-Za-z0-9:_-]+$/);
  expect(body.representativeGenerationTaskId).toBeUndefined();
  expect(body.sourceGenerationTaskId).toBeUndefined();
  await expect(page.getByTestId('save-style-memory-dialog')).toBeHidden();
  expect(page.url()).toContain('directionId=conversation-direction');
});

uiSuite('AC-18 unknown save outcome checks the same-key receipt, then retries with the original key', async ({ page }) => {
  await mockAuthSession(page);
  await mockAgentConversation(page, { draft: WORKING_DRAFT });
  await mockCdnImages(page);
  const save = await mockMemoryCreate(page, [
    { abort: true },
    { status: 201, body: { id: 'draft-memory-1', reused: false } },
  ]);
  const receipt = await mockMemoryReceiptQuery(page, () => ({ event: null }));
  await page.goto('/workspace?directionId=conversation-direction');
  await openDraftSaveDialog(page);
  await page.getByLabel('Name', { exact: true }).fill('Amber studio memory');
  await page.getByRole('button', { name: 'Save Style Memory', exact: true }).click();
  await expect.poll(() => save.requests.length).toBe(1);
  await expect.poll(() => receipt.queriedKeys.length).toBe(1);
  expect(receipt.queriedKeys[0]).toBe(`memory:${save.requests[0].body.requestKey}`);
  const dialog = page.getByTestId('save-style-memory-dialog');
  await expect(dialog.getByTestId('save-unknown-status')).toContainText(/did not complete/i);
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Amber studio memory');
  await page.getByRole('button', { name: 'Save Style Memory', exact: true }).click();
  await expect.poll(() => save.requests.length).toBe(2);
  expect(save.requests[1].body.requestKey).toBe(save.requests[0].body.requestKey);
  expect(save.requests[1].body.name).toBe('Amber studio memory');
});

uiSuite('AC-18 committed save with failing refresh keeps the saved fact and retries reads only', async ({ page }) => {
  await mockAuthSession(page);
  await mockAgentConversation(page, { draft: WORKING_DRAFT });
  await mockCdnImages(page);
  const save = await mockMemoryCreate(page, [
    { status: 201, body: { id: 'draft-memory-1', name: 'Saved draft memory' } },
  ]);
  let listReads = 0;
  await page.route('**/api/templates?**', async (route) => {
    if (route.request().method() === 'GET') {
      listReads++;
      await route.fulfill({ json: { items: [], hasMore: false, nextCursor: null } });
    } else {
      await route.continue();
    }
  });
  await page.goto('/workspace?directionId=conversation-direction');
  await openDraftSaveDialog(page);
  await page.getByLabel('Name', { exact: true }).fill('Amber studio memory');
  await page.getByRole('button', { name: 'Save Style Memory', exact: true }).click();
  await expect.poll(() => save.requests.length).toBe(1);
  const banner = page.getByTestId('memory-refresh-partial-error');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/Saved, but refresh failed/i);
  const readsBeforeRetry = listReads;
  await page.getByTestId('memory-refresh-retry').click();
  await expect.poll(() => listReads).toBeGreaterThan(readsBeforeRetry);
  expect(save.requests).toHaveLength(1);
});

uiSuite('AC-21 reload after unknown save never replays the POST and preserves the form and receipt outcome', async ({ page }) => {
  await mockAuthSession(page);
  await mockAgentConversation(page, { draft: WORKING_DRAFT });
  await mockCdnImages(page);
  const save = await mockMemoryCreate(page, [
    { abort: true },
    { status: 201, body: { id: 'draft-memory-1', name: 'Saved draft memory' } },
    { abort: true },
  ]);
  // 第二个键的回执：向导首次查询（保存当场）不存在，恢复期查询（重载后）命中
  let recoveredKey: string | null = null;
  const receiptQueries: Record<string, number> = {};
  const receipt = await mockMemoryReceiptQuery(page, (key) => {
    receiptQueries[key] = (receiptQueries[key] ?? 0) + 1;
    if (recoveredKey !== null && key === `memory:${recoveredKey}` && receiptQueries[key] >= 2) {
      return {
        event: {
          id: 'memory-receipt-2',
          directionId: 'conversation-direction',
          requestKey: key,
          kind: 'memory',
          memoryId: 'draft-memory-2',
        },
      };
    }
    return { event: null };
  });
  await page.goto('/workspace?directionId=conversation-direction');
  await openDraftSaveDialog(page);
  await page.getByLabel('Name', { exact: true }).fill('Amber studio memory');
  await page.getByRole('button', { name: 'Save Style Memory', exact: true }).click();
  await expect.poll(() => receipt.queriedKeys.length).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  // 取消后内联即呈现未确认事实（本机保留，不称已同步），并等待意图落盘
  await expect(page.getByTestId('memory-save-recovery')).toContainText(/did not complete/i);
  await page.reload();
  const recovery = page.getByTestId('memory-save-recovery');
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText(/did not complete/i);
  expect(save.requests).toHaveLength(1);
  await recovery.getByRole('button', { name: /review and retry/i }).click();
  const dialog = page.getByTestId('save-style-memory-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Amber studio memory');
  await page.getByRole('button', { name: 'Save Style Memory', exact: true }).click();
  await expect.poll(() => save.requests.length).toBe(2);
  expect(save.requests[1].body.requestKey).toBe(save.requests[0].body.requestKey);
  // 第二次保存响应未知，但服务端实际已有同键回执：恢复只读确认，不重放保存
  await openDraftSaveDialog(page);
  await page.getByLabel('Name', { exact: true }).fill('Amber studio memory 2');
  await page.getByRole('button', { name: 'Save Style Memory', exact: true }).click();
  await expect.poll(() => save.requests.length).toBe(3);
  const secondKey = save.requests[2].body.requestKey;
  expect(secondKey).not.toBe(save.requests[0].body.requestKey);
  recoveredKey = String(secondKey);
  await expect(
    page.getByTestId('save-style-memory-dialog').getByTestId('save-unknown-status'),
  ).toContainText(/did not complete/i);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload();
  const confirmed = page.getByTestId('memory-save-recovery');
  await expect(confirmed).toContainText(/already completed on the server/i);
  expect(save.requests).toHaveLength(3);
});

// ─── 真实 DB / HTTP API（经 node scripts/test-workspace-db.mjs --e2e 运行） ────

const apiSuite = process.env.WORKSPACE_TEST_DATABASE_URL ? test : test.skip;

apiSuite('AC-02 AC-17 AC-18 real templates write points carry transactional requestKey receipts', async ({ playwright, baseURL }) => {
  test.setTimeout(180000);
  const pool = workspaceTestPool();
  const source = await seedWorkspaceSources(pool);
  const api = await playwright.request.newContext({ baseURL, storageState: { cookies: [await workspaceAuthCookie(source.user)], origins: [] } });
  try {
    // 方向来源 Memory 缺 analysis：真实缺项，不伪造 completed 分析（AC-02）
    const orphan = await api.post('/api/templates', { data: { name: 'Orphan memory', content: 'editable memory' } });
    expect(orphan.status()).toBe(201);
    const orphanDirection = await api.post('/api/workspace/directions', { data: { requestKey: ulid(), title: 'From orphan', sourceKind: 'template', sourceId: (await orphan.json()).id } });
    expect(orphanDirection.status()).toBe(201);
    const orphanId = (await orphanDirection.json()).direction.id;
    expect((await (await api.get(`/api/workspace/directions/${orphanId}`)).json()).readiness.canGenerate).toBe(false);
    // 编辑写点：requestKey 回执幂等（重复键回原记录）
    const orphanId26 = (await orphan.json()).id;
    const editKey = ulid();
    const editBody = { description: 'edited without analysis', requestKey: editKey, directionId: orphanId };
    const orphanEdit = await api.put(`/api/templates/${orphanId26}`, { data: editBody });
    expect(orphanEdit.status()).toBe(200);
    const orphanEditAgain = await api.put(`/api/templates/${orphanId26}`, { data: editBody });
    expect(orphanEditAgain.status()).toBe(200);
    expect((await orphanEditAgain.json()).reused).toBe(true);
    expect((await api.put(`/api/templates/${orphanId26}`, { data: { ...editBody, description: 'different edit' } })).status()).toBe(409);

    // 创建写点：requestKey + directionId，事务回执（AC-17/AC-18）
    const direction = await api.post('/api/workspace/directions', { data: { requestKey: ulid(), title: 'Memory direction', sourceKind: 'iteration', sourceId: source.iterationId } });
    expect(direction.status()).toBe(201);
    const directionId = (await direction.json()).direction.id;
    const key = ulid();
    const createBody = {
      requestKey: key,
      directionId,
      name: 'Verified memory',
      content: 'A quiet studio with amber light',
      sourceAssetId: source.assetId,
      sourceGenerationTaskId: source.iterationId,
      representativeGenerationTaskId: source.iterationId,
    };
    const created = await api.post('/api/templates', { data: createBody });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.reused).toBe(false);
    expect(createdBody.verificationStatus).toBe('user_verified');
    // 重复同键同内容 → 200 原记录；同键异内容 → 409；回执可按键查询
    const repeated = await api.post('/api/templates', { data: createBody });
    expect(repeated.status()).toBe(200);
    expect((await repeated.json()).id).toBe(createdBody.id);
    expect((await repeated.json()).reused).toBe(true);
    expect((await api.post('/api/templates', { data: { ...createBody, name: 'Different content' } })).status()).toBe(409);
    const receipt = await (await api.get(`/api/workspace/directions/${directionId}/events?requestKey=memory:${key}`)).json();
    expect(receipt.event?.memoryId).toBe(createdBody.id);
    expect(receipt.event?.kind).toBe('memory');
    // 目标删除后同键重试：404 保留表单事实，不重建
    await pool.query('DELETE FROM templates WHERE id=$1', [createdBody.id]);
    expect((await api.post('/api/templates', { data: createBody })).status()).toBe(404);

    // 副本写点：新副本 pending_verification；重复键回原副本（AC-17）
    const baseMemoryId = ulid();
    await pool.query("INSERT INTO templates(id,name,content,user_id,source_asset_id,source_generation_task_id,representative_generation_task_id,verification_status) VALUES($1,'Base memory','base content',$2,$3,$4,$4,'user_verified')", [baseMemoryId, source.user.id, source.assetId, source.iterationId]);
    const duplicateKey = ulid();
    const duplicateBody = { requestKey: duplicateKey, directionId };
    const duplicated = await api.post(`/api/templates/${baseMemoryId}/duplicate`, { data: duplicateBody });
    expect(duplicated.status()).toBe(201);
    const duplicateRecord = await duplicated.json();
    expect(duplicateRecord.verificationStatus).toBe('pending_verification');
    expect((await api.post(`/api/templates/${baseMemoryId}/duplicate`, { data: duplicateBody })).status()).toBe(200);
    expect((await api.post(`/api/templates/${baseMemoryId}/duplicate`, { data: { ...duplicateBody, requestKey: ulid() } })).status()).toBe(201);

    // 代表结果写点：用户确认代表才 user_verified；重复键回执（AC-17）
    const representativeKey = ulid();
    const representativeBody = { generationTaskId: source.iterationId, requestKey: representativeKey, directionId };
    const represented = await api.post(`/api/templates/${duplicateRecord.id}/representative-result`, { data: representativeBody });
    expect(represented.status()).toBe(200);
    expect((await represented.json()).verificationStatus).toBe('user_verified');
    const representedAgain = await api.post(`/api/templates/${duplicateRecord.id}/representative-result`, { data: representativeBody });
    expect(representedAgain.status()).toBe(200);
    expect((await representedAgain.json()).reused).toBe(true);
    expect((await api.post(`/api/templates/${duplicateRecord.id}/representative-result`, { data: { ...representativeBody, generationTaskId: source.iterationId, requestKey: ulid() } })).status()).toBe(200);

    // 归属与键校验：跨用户方向 404；键单独出现 400；异 hash 同键 409（AC-18/安全）
    expect((await api.post('/api/templates', { data: { ...createBody, requestKey: ulid(), directionId: ulid() } })).status()).toBe(404);
    expect((await api.post('/api/templates', { data: { name: 'Key without direction', content: 'x', requestKey: ulid() } })).status()).toBe(400);
    expect((await api.post('/api/templates', { data: { name: 'Bad key chars', content: 'x', requestKey: 'not a valid key!', directionId } })).status()).toBe(400);

    // 无键旧调用兼容：不携带 requestKey 的创建/编辑照常工作（AC-18 兼容）
    const legacy = await api.post('/api/templates', { data: { name: 'Legacy memory', content: 'legacy content' } });
    expect(legacy.status()).toBe(201);
    expect((await legacy.json()).reused).toBeUndefined();
    expect((await api.put(`/api/templates/${(await legacy.json()).id}`, { data: { description: 'legacy edit' } })).status()).toBe(200);
  } finally {
    await api.dispose();
    await cleanupWorkspaceUser(pool, source.user.id);
    await pool.end();
  }
});
