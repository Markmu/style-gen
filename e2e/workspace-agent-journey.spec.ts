import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import {
  loadFixture,
  mockAgentConversation,
  mockAgentHistory,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockAuthSession,
  mockCdnImages,
  mockGenerationCreateCapture,
  mockGenerationCreateSequence,
  mockGenerationList,
  mockDirectionFeedStateful,
  mockGenerationPolling,
  mockUploadPresign,
} from './helpers/mock-api';

const picture = resolve(__dirname, 'fixtures/test-image.png');
const processingAnalysis = {
  id: 'journey-analysis',
  status: 'processing',
  recipe: null,
  promptText: null,
  negativePromptText: null,
  errorMessage: null,
  errorStage: null,
};

async function revealInspectorPanel(page: import('@playwright/test').Page, panel: 'evidence' | 'draft' | 'prompt') {
  const label = panel === 'evidence' ? 'Evidence' : panel === 'draft' ? 'Draft' : 'Prompt';
  await page.getByRole('tablist', { name: 'Workspace inspector' }).getByRole('tab', { name: label, exact: true }).click();
}

test('AC-01 US-01 reference-entry keeps the goal and starts analysis from the composer in the final layout', async ({ page }) => {
  await mockAuthSession(page);
  await mockCdnImages(page);
  await mockUploadPresign(page);
  await mockAnalysisCreate(page, 'journey-analysis');
  await mockAnalysisPolling(page, 'journey-analysis', processingAnalysis);
  let analysisPosts = 0;
  page.on('request', request => {
    if (request.url().endsWith('/api/analysis') && request.method() === 'POST') analysisPosts++;
  });
  await page.goto('/workspace');
  await expect(page.getByTestId('workspace-agent-layout')).toBeVisible();
  await expect(page.getByTestId('workspace-three-column-layout')).toHaveCount(0);
  const goal = page.getByRole('textbox', { name: 'Message your creative goal' });
  await goal.fill('Keep the light, change the subject to a ceramic bowl');
  await page.getByLabel('Attach reference', { exact: true }).setInputFiles(picture);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => analysisPosts).toBe(1);
  await expect(goal).toHaveValue('Keep the light, change the subject to a ceramic bowl');
});

test('AC-05 US-02 review-proposal: edit and apply inside the conversation column, then inspect the draft', async ({ page }) => {
  await mockAuthSession(page);
  const state = await mockAgentConversation(page, {
    source: { analysisStatus: 'completed', ...loadFixture('analysis-v2-completed.json') },
    draft: {
      control: null,
      customPrompt: 'A quiet studio',
      negativePromptText: 'no text',
      params: { model: 'flux-2-dev', quality: 'standard', aspectRatio: '3:4' },
      constraints: [],
      aspectRatioSource: 'user',
    },
    replies: [{
      responseKind: 'proposal',
      proposalState: 'pending',
      replyText: 'Review the scene change first.',
      changes: [{ target: 'customPrompt', key: '', action: 'set', before: 'A quiet studio', after: 'A bright studio' }],
    }],
  });
  await page.goto('/workspace?directionId=conversation-direction');
  await page.getByRole('textbox', { name: 'Message your creative goal' }).fill('Make it a bright studio');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('log', { name: 'Direction messages' })).toContainText('Review the scene change first');
  await page.getByRole('button', { name: 'Edit draft' }).click();
  await page.getByRole('textbox', { name: 'Proposed customPrompt' }).fill('A bright open studio');
  await page.getByRole('button', { name: 'Apply proposal' }).click();
  await expect(page.getByRole('log', { name: 'Direction messages' })).toContainText('Applied at revision 1');
  expect(state.direction.draft.customPrompt).toBe('A bright open studio');
  await revealInspectorPanel(page, 'draft');
  await expect(page.getByTestId('draft-inspector')).toContainText('revision 1');
  await expect(page.getByTestId('draft-inspector')).toContainText('A bright open studio');
});

test('AC-09 US-03 authorized-render submits exactly once from the lower bar and freezes the record', async ({ page }) => {
  await mockAuthSession(page);
  await mockGenerationList(page);
  await mockCdnImages(page);
  await mockUploadPresign(page);
  await mockAnalysisCreate(page, 'journey-render-analysis');
  await mockAnalysisPolling(page, 'journey-render-analysis', { ...loadFixture('analysis-v2-completed.json'), id: 'journey-render-analysis' });
  const generation = await mockGenerationCreateCapture(page, 'journey-render');
  await mockGenerationPolling(page, 'journey-render', { ...loadFixture('generation-completed.json'), id: 'journey-render' });
  await page.goto('/workspace');
  await page.getByTestId('reference-card').locator('input[type=file]').setInputFiles(picture);
  await expect(page.getByTestId('recipe-card')).toContainText(/light|color|object|space/i, { timeout: 20000 });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const bar = page.getByTestId('generation-bar');
  await expect(bar.getByRole('button', { name: 'Generate 1 image', exact: true })).toBeEnabled();
  await bar.getByRole('button', { name: 'Generate 1 image', exact: true }).click();
  await bar.getByRole('button', { name: 'Generate 1 image', exact: true }).click();
  await expect.poll(() => generation.requests.length).toBe(1);
  await expect(bar.getByLabel('Fixed submission record')).toContainText('Submitted revision');
});

test('AC-13 AC-14 US-04 compare-continue keeps selection across view tabs and continue previews before restoring', async ({ page }) => {
  const { mutations } = await mockAgentHistory(page);
  await page.goto('/workspace?directionId=conversation-direction');
  await page.getByRole('button', { name: 'Select result old-result', exact: true }).click();
  await page.getByRole('button', { name: 'Compare viewed result' }).click();
  const panel = page.getByTestId('result-comparison-panel');
  await expect(panel).toBeVisible();
  await panel.getByLabel('Compare against').selectOption('other-result');
  await page.getByRole('tab', { name: 'Reference', exact: true }).click();
  await page.getByRole('tab', { name: 'Compare', exact: true }).click();
  await expect(panel.getByLabel('Compare against')).toHaveValue('other-result');
  await page.getByRole('button', { name: 'Continue from this result', exact: true }).first().click();
  const detail = page.getByRole('dialog', { name: 'History Detail' });
  await detail.getByRole('button', { name: 'Continue from this result', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Preview direction change' });
  await expect(preview).toContainText('Frozen prompt old-result');
  await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(mutations).toHaveLength(0);
});

test('AC-17 US-05 save-memory stays reachable from the result rail in the final layout', async ({ page }) => {
  const { mutations } = await mockAgentHistory(page);
  await page.goto('/workspace?directionId=conversation-direction');
  await page.getByRole('button', { name: 'Select result old-result', exact: true }).click();
  const saveEntry = page.getByTestId('direction-result-rail').getByRole('button', { name: /Save or update Style Memory/i }).first();
  await saveEntry.click();
  const dialog = page.getByRole('dialog').filter({ hasText: /Style Memory/i }).first();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Cancel|Close/i }).first().click();
  expect(mutations.filter(m => m.method === 'POST')).toHaveLength(0);
});

test('AC-15 US-06 recover-without-replay restores an active task after reload without new writes', async ({ page }) => {
  await mockAuthSession(page);
  let writes = 0;
  page.on('request', request => {
    if (request.url().includes('/api/workspace/directions') && request.method() !== 'GET') writes++;
  });
  const direction = {
    id: 'journey-active-direction', userId: 'mock-user-id', draftRevision: 2, analysisTaskId: 'journey-analysis',
    sourceAssetId: 'asset-1', sourceTemplateId: null, sourceIterationId: null, preferredIterationId: null,
    draft: { control: null, customPrompt: 'Working prompt', negativePromptText: '', params: { model: 'flux-2-dev', quality: 'standard', aspectRatio: '1:1' }, constraints: [], aspectRatioSource: 'user' },
  };
  await page.route('**/api/workspace/directions/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/events')) {
      await route.fulfill({ json: { items: [], throughSequence: 0, hasMore: false } });
      return;
    }
    await route.fulfill({ json: { direction, source: { reference: { id: 'asset-1', fileUrl: 'https://cdn.example.com/ref.webp', width: 100, height: 100, mimeType: 'image/webp' }, recipe: (loadFixture('analysis-v2-completed.json') as { recipe: unknown }).recipe, variables: [], analysisStatus: 'completed' }, activeTask: { id: 'journey-active-task', status: 'processing' }, summaryToken: 'mock-summary-token' } });
  });
  await page.route('**/api/generation/journey-active-task', async route => {
    await route.fulfill({ json: { id: 'journey-active-task', status: 'processing', dispatchState: 'dispatched', resultFileUrl: null } });
  });
  await page.goto('/workspace?directionId=journey-active-direction');
  const bar = page.getByTestId('generation-bar');
  await expect(bar.getByRole('button', { name: 'Generating 1 image' })).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('workspace-agent-layout')).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Generating 1 image' })).toBeDisabled();
  expect(writes).toBe(0);
});

test('AC-12 US-08 inspector evidence links to prompt, draft shows variables and rules', async ({ page }) => {
  await mockAuthSession(page);
  await mockAgentConversation(page, {
    source: { analysisStatus: 'completed', ...loadFixture('analysis-v2-completed.json') },
    draft: {
      control: null, customPrompt: 'A quiet studio', negativePromptText: 'no text',
      params: { model: 'flux-2-dev', quality: 'standard', aspectRatio: '3:4' }, constraints: ['Keep negative space'], aspectRatioSource: 'user',
    },
  });
  await page.goto('/workspace?directionId=conversation-direction');
  const inspectorTabs = page.getByRole('tablist', { name: 'Workspace inspector' });
  await expect(inspectorTabs.getByRole('tab', { name: 'Evidence' })).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('recipe-card').getByTestId(/^evidence-facet-/).first().click();
  await page.getByRole('button', { name: /^Show in prompt:/ }).first().click();
  await expect(inspectorTabs.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('prompt-card')).toBeVisible();
  await revealInspectorPanel(page, 'draft');
  await expect(page.getByTestId('draft-inspector')).toContainText('Keep negative space');
});

test('AC-21 r2 upload failure keeps the goal editable and never starts analysis', async ({ page }) => {
  await mockAuthSession(page);
  await mockCdnImages(page);
  await mockUploadPresign(page);
  await page.route('**/api/upload/presign', route => route.fulfill({ status: 500, json: { error: 'R2 unavailable' } }));
  let analysisPosts = 0;
  page.on('request', request => {
    if (request.url().endsWith('/api/analysis') && request.method() === 'POST') analysisPosts++;
  });
  await page.goto('/workspace');
  const goal = page.getByRole('textbox', { name: 'Message your creative goal' });
  await goal.fill('Keep this goal while upload fails');
  await page.getByLabel('Attach reference', { exact: true }).setInputFiles(picture);
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry upload', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry upload', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /upload|reference|R2/i }).first()).toBeVisible({ timeout: 20000 });
  await expect(goal).toHaveValue('Keep this goal while upload fails');
  expect(analysisPosts).toBe(0);
});

test('AC-21 analysis failure keeps the attachment and goal and offers a scoped retry', async ({ page }) => {
  await mockAuthSession(page);
  await mockCdnImages(page);
  await mockUploadPresign(page);
  await mockAnalysisCreate(page, 'journey-failed-analysis');
  await mockAnalysisPolling(page, 'journey-failed-analysis', {
    id: 'journey-failed-analysis', status: 'failed', recipe: null, promptText: null, negativePromptText: null,
    errorMessage: 'Analysis unavailable', errorStage: 'vision',
  });
  await page.goto('/workspace');
  const goal = page.getByRole('textbox', { name: 'Message your creative goal' });
  await goal.fill('Keep this goal while analysis fails');
  await page.getByLabel('Attach reference', { exact: true }).setInputFiles(picture);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry analysis' })).toBeVisible({ timeout: 20000 });
  await expect(goal).toHaveValue('Keep this goal while analysis fails');
});

test('AC-21 agent failure retries only the failed message and leaves the draft unchanged', async ({ page }) => {
  await mockAuthSession(page);
  const state = await mockAgentConversation(page, { replies: [{ state: 'failed', errorCode: 'AGENT_OUTPUT_INVALID', replyText: null }, { replyText: 'Recovered answer' }] });
  await page.goto('/workspace?directionId=conversation-direction');
  const goal = page.getByRole('textbox', { name: 'Message your creative goal' });
  await goal.fill('Explain the lighting');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry message' })).toBeVisible({ timeout: 20000 });
  await expect(goal).toHaveValue('');
  await page.getByRole('button', { name: 'Retry message' }).click();
  await expect.poll(() => state.turns.length).toBe(2);
  expect(state.direction.draftRevision).toBe(0);
});

test('AC-21 generation unknown checks read-only first and confirms the original body once', async ({ page }) => {
  await mockAuthSession(page);
  await mockGenerationList(page);
  await mockCdnImages(page);
  await mockUploadPresign(page);
  await mockAnalysisCreate(page, 'journey-unknown-analysis');
  await mockAnalysisPolling(page, 'journey-unknown-analysis', { ...loadFixture('analysis-v2-completed.json'), id: 'journey-unknown-analysis' });
  const generation = await mockGenerationCreateSequence(page, [{ status: 503, body: { error: 'Response unknown' } }, { taskId: 'journey-confirmed-task' }]);
  await mockGenerationPolling(page, 'journey-confirmed-task', { id: 'journey-confirmed-task', status: 'processing' });
  await page.goto('/workspace');
  await page.getByTestId('reference-card').locator('input[type=file]').setInputFiles(picture);
  await expect(page.getByTestId('recipe-card')).toContainText(/light|color|object|space/i, { timeout: 20000 });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const bar = page.getByTestId('generation-bar');
  await bar.getByRole('button', { name: 'Generate 1 image', exact: true }).click();
  await expect.poll(() => generation.requests.length).toBe(1);
  await page.route('**/api/generation?requestKey=*', route => route.fulfill({ json: { task: null } }));
  await bar.getByRole('button', { name: 'Check original submission' }).click();
  expect(generation.requests).toHaveLength(1);
  await bar.getByRole('button', { name: 'Confirm original submission' }).click();
  await expect.poll(() => generation.requests.length).toBe(2);
  expect(generation.requests[1].body).toEqual(generation.requests[0].body);
});

test('AC-21 cdn result failure recovers the preview without resubmitting', async ({ page }) => {
  await mockAgentHistory(page);
  await page.route('https://cdn.example.com/old-result.webp', route => route.fulfill({ status: 404 }));
  await page.goto('/workspace?directionId=conversation-direction');
  await page.getByRole('button', { name: 'Select result old-result', exact: true }).click();
  await expect(page.getByTestId('result-viewer')).toContainText('Result preview unavailable', { timeout: 20000 });
  let generationPosts = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/generation' && request.method() === 'POST') generationPosts++;
  });
  await page.getByRole('button', { name: 'Reload image' }).click();
  expect(generationPosts).toBe(0);
});

test('AC-21 expired session keeps edits local and reconnect performs no replay', async ({ page }) => {
  await mockAuthSession(page);
  let signedIn = false;
  let writes = 0;
  await page.route('**/api/workspace/directions/**', async route => {
    if (route.request().method() !== 'GET') writes++;
    if (!signedIn) {
      await route.fulfill({ status: 401, json: { error: 'Session expired' } });
      return;
    }
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/events')) {
      await route.fulfill({ json: { items: [], throughSequence: 0, hasMore: false } });
      return;
    }
    await route.fulfill({ json: { direction: { id: 'journey-session', userId: 'mock-user-id', draftRevision: 0, analysisTaskId: null, sourceAssetId: null, sourceTemplateId: null, sourceIterationId: null, preferredIterationId: null, draft: { control: null, customPrompt: null, negativePromptText: '', params: { model: 'flux-2-dev', quality: 'standard', aspectRatio: '1:1' }, constraints: [], aspectRatioSource: 'fallback' } }, source: { reference: null, recipe: null, variables: [], analysisStatus: null }, activeTask: null, summaryToken: null } });
  });
  await page.goto('/workspace?directionId=journey-session');
  const goal = page.getByRole('textbox', { name: 'Message your creative goal' });
  await goal.fill('Still editable after expiry');
  await expect(page.getByRole('button', { name: 'Reconnect', exact: true })).toBeVisible();
  signedIn = true;
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(goal).toHaveValue('Still editable after expiry');
  expect(writes).toBe(0);
});

test('AC-21 direction feed failure shows a scoped retry without touching the draft', async ({ page }) => {
  await mockAuthSession(page);
  const state = await mockAgentConversation(page, { source: { analysisStatus: 'completed', ...loadFixture('analysis-v2-completed.json') } });
  Object.assign(state.direction, { analysisTaskId: 'journey-feed-analysis' });
  let feedReads = 0;
  await page.route('**/api/generation?*', async route => {
    feedReads++;
    await route.fulfill({ status: 500, json: { error: 'Feed unavailable' } });
  });
  await page.goto('/workspace?directionId=conversation-direction');
  await expect(page.getByTestId('direction-result-rail')).toContainText(/retry|unavailable|failed/i, { timeout: 20000 });
  const goal = page.getByRole('textbox', { name: 'Message your creative goal' });
  await goal.fill('Draft stays editable during feed failure');
  await expect(goal).toHaveValue('Draft stays editable during feed failure');
  expect(feedReads).toBeGreaterThan(0);
});

test('AC-22 cancelling direction preview returns keyboard focus to its origin', async ({ page }) => {
  await mockAuthSession(page);
  await mockAgentConversation(page);
  await page.goto('/workspace?directionId=conversation-direction');
  const origin = page.getByRole('button', { name: 'New direction', exact: true });
  await origin.focus();
  await origin.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Preview direction change' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Preview direction change' })).toHaveCount(0);
  await expect(origin).toBeFocused();
});

