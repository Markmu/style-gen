import { test, expect } from '@playwright/test';
import { loadFixture, mockAgentConversation, mockAuthSession, mockCdnImages, mockGenerationList } from './helpers/mock-api';

// Desktop-only product: mobile viewports and compatibility removed (2026-09-11).
const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
];
const themes = ['light', 'dark'] as const;

async function prepareReadyWorkspace(page: import('@playwright/test').Page, theme: string) {
  await page.addInitScript(value => {
    window.localStorage.setItem('visoryn-theme-preference', value);
  }, theme);
  await mockAuthSession(page);
  await mockCdnImages(page);
  await page.route('https://cdn.example.com/reference.webp', route => route.fulfill({ path: 'public/landing/reference-still-life.webp', contentType: 'image/webp' }));
  await mockGenerationList(page);
  const state = await mockAgentConversation(page, {
    source: { ...loadFixture('analysis-v2-completed.json'), analysisStatus: 'completed', reference: { id: 'ref', fileUrl: 'https://cdn.example.com/reference.webp', width: 100, height: 100, mimeType: 'image/webp' } },
    draft: {
      control: null,
      customPrompt: 'A quiet editorial studio still life',
      negativePromptText: 'no text',
      params: { model: 'flux-2-dev', quality: 'standard', aspectRatio: '3:4' },
      constraints: [],
      aspectRatioSource: 'user',
    },
  });
  Object.assign(state.direction, { analysisTaskId: 'visual-analysis', sourceAssetId: 'ref' });
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test(`AC-22 final layout ${viewport.width}x${viewport.height} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await prepareReadyWorkspace(page, theme);
      await page.goto('/workspace?directionId=conversation-direction');
      await expect(page.getByTestId('workspace-agent-layout')).toBeVisible();
      await expect(page.getByTestId('workspace-three-column-layout')).toHaveCount(0);
      await expect(page.getByTestId('workspace-bottom-bar')).toHaveCount(0);
      await expect(page.getByTestId('generation-bar')).toBeVisible();
      const conversationBox = await page.getByTestId('workspace-conversation-pane').boundingBox();
      const canvasBox = await page.getByTestId('workspace-canvas-pane').boundingBox();
      expect(conversationBox).not.toBeNull();
      expect(canvasBox).not.toBeNull();
      expect(conversationBox!.width / (conversationBox!.width + canvasBox!.width)).toBeCloseTo(0.42, 2);
      const composer = page.getByTestId('agent-composer');
      const bar = page.getByTestId('generation-bar');
      const composerBox = await composer.boundingBox();
      const barBox = await bar.boundingBox();
      expect(barBox!.y).toBeGreaterThanOrEqual(composerBox!.y + composerBox!.height);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      {
        await expect(page.getByTestId('workspace-conversation-pane')).toBeVisible();
        await expect(page.getByTestId('workspace-canvas-pane')).toBeVisible();
      }
      await expect(page).toHaveScreenshot(`workspace-agent-${viewport.width}x${viewport.height}-${theme}.png`, {
        animations: 'disabled',
        fullPage: false,
      });
      await page.screenshot({ path: info.outputPath(`workspace-agent-${viewport.width}x${viewport.height}-${theme}.png`), animations: 'disabled' });
    });
  }
}

test('AC-22 reduced motion keeps the layout readable without transition-dependent states', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareReadyWorkspace(page, 'dark');
  await page.goto('/workspace?directionId=conversation-direction');
  await expect(page.getByTestId('workspace-canvas-pane')).toBeVisible();
  await expect(page.getByTestId('generation-bar')).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
