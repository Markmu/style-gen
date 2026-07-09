import { expect, test, type Locator, type Page } from '@playwright/test'
import { resolve } from 'path'
import {
  loadFixture,
  mockAnalysisCreate,
  mockAnalysisPolling,
  mockApiError,
  mockAuthSession,
  mockGenerationCreate,
  mockGenerationList,
  mockGenerationPolling,
  mockTemplateCollection,
  mockUploadPresign,
  type MockTemplateMemoryRecord,
} from './helpers/mock-api'

const TEST_IMAGE_PATH = resolve(__dirname, 'fixtures/test-image.png')

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const qaViewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 1280, height: 800 },
  { name: 'narrow', width: 390, height: 844 },
]

const styleMemories: MockTemplateMemoryRecord[] = [
  {
    id: 'visual-qa-source-backed-memory',
    name: 'Visual QA Source Backed Memory',
    content:
      'Create {{subject}} with soft glass highlights, editorial spacing, and precise surface texture.',
    variables: [
      { name: 'subject', label: 'Subject', defaultValue: 'glass sculpture' },
      { name: 'scene', label: 'Scene', defaultValue: 'white studio' },
    ],
    sourceAssetId: 'visual-qa-source-asset',
    sourceImageUrl: 'https://cdn.example.com/references/visual-qa-source/original.png',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'visual-qa-text-only-memory',
    name: 'Visual QA Prompt Structure',
    content: 'Reusable prompt structure for clean product macro scenes.',
    variables: [],
    sourceAssetId: null,
    sourceImageUrl: null,
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
  },
]

async function openRoute(page: Page, route: string) {
  try {
    await page.goto(route, { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }

  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
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

async function mockVisualQaBase(page: Page, templates = styleMemories) {
  await mockAuthSession(page)
  await mockGenerationList(page)
  await mockTemplateCollection(page, templates)
  await mockCdnImages(page)
}

async function uploadReference(page: Page) {
  await expect(page.getByText(/click or drag to upload a reference image/i).first()).toBeVisible({
    timeout: 10000,
  })
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByText(/click or drag to upload a reference image/i).first().click()
  const chooser = await chooserPromise
  await chooser.setFiles(TEST_IMAGE_PATH)
}

async function openWorkspaceWithAnalysisReady(page: Page, taskId: string) {
  await mockVisualQaBase(page)
  await mockUploadPresign(page)
  await mockAnalysisCreate(page, taskId)
  await mockAnalysisPolling(page, taskId, loadFixture('analysis-completed.json'))

  await openRoute(page, '/workspace')
  await uploadReference(page)
  await expect(page.getByTestId('ai-status-header')).toHaveAttribute('data-phase', 'analysis_ready', {
    timeout: 15000,
  })
}

function appShell(page: Page) {
  return page.getByTestId('app-shell')
}

function promptEditor(page: Page) {
  return page.getByTestId('unified-prompt-editor')
}

function renderDock(page: Page) {
  return page.getByTestId('output-card')
}

function statePresenter(page: Page, status: string) {
  return page.locator(`section[data-status="${status}"]`)
}

async function expectPageNonEmpty(page: Page) {
  await expect(appShell(page)).toBeVisible({ timeout: 15000 })
  await expect(page.locator('main')).toBeVisible()

  const stats = await appShell(page).evaluate((shell) => {
    const textLength = (shell.textContent ?? '').replace(/\s+/g, ' ').trim().length
    const visibleElements = Array.from(shell.querySelectorAll('*')).filter((element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)

      return (
        rect.width > 1 &&
        rect.height > 1 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) > 0
      )
    }).length

    return { textLength, visibleElements }
  })

  expect(stats.textLength).toBeGreaterThan(80)
  expect(stats.visibleElements).toBeGreaterThan(8)
}

async function expectButtonsDoNotOverflow(root: Locator) {
  const overflowingButtons = await root.evaluateAll((roots) => {
    const buttons = roots.flatMap((root) =>
      Array.from(root.querySelectorAll('button')),
    )

    return buttons
      .map((button) => {
        const rect = button.getBoundingClientRect()
        const style = window.getComputedStyle(button)
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            const parent = node.parentElement
            const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()

            if (!parent || !text) return NodeFilter.FILTER_REJECT
            if (
              parent.closest('[aria-hidden="true"], .icon, .material-symbols-outlined, .sr-only')
            ) {
              return NodeFilter.FILTER_REJECT
            }

            return NodeFilter.FILTER_ACCEPT
          },
        })
        const textNodes: Text[] = []
        let node = walker.nextNode()

        while (node) {
          textNodes.push(node as Text)
          node = walker.nextNode()
        }
        const text = textNodes
          .map((textNode) => textNode.textContent ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        const inViewport =
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.top < window.innerHeight

        if (
          !text ||
          rect.width <= 1 ||
          rect.height <= 1 ||
          !inViewport ||
          style.visibility === 'hidden' ||
          style.display === 'none' ||
          Number(style.opacity) === 0
        ) {
          return null
        }

        const overflowingText = textNodes.some((textNode) => {
          const range = document.createRange()
          range.selectNodeContents(textNode)
          const textRect = range.getBoundingClientRect()
          range.detach()

          if (textRect.width <= 1 || textRect.height <= 1) return false

          return (
            textRect.left < rect.left - 3 ||
            textRect.right > rect.right + 3 ||
            textRect.top < rect.top - 3 ||
            textRect.bottom > rect.bottom + 3
          )
        })

        return overflowingText
          ? {
              text,
              buttonWidth: Math.round(rect.width),
              buttonHeight: Math.round(rect.height),
            }
          : null
      })
      .filter(Boolean)
  })

  expect(overflowingButtons).toEqual([])
}

async function expectVisibleTextDoesNotOverlap(page: Page) {
  const overlaps = await page.locator('main').evaluate((main) => {
    function intersect(
      a: { left: number; top: number; right: number; bottom: number },
      b: { left: number; top: number; right: number; bottom: number },
    ) {
      return {
        left: Math.max(a.left, b.left),
        top: Math.max(a.top, b.top),
        right: Math.min(a.right, b.right),
        bottom: Math.min(a.bottom, b.bottom),
      }
    }

    function visibleRectFor(element: HTMLElement) {
      let rect = element.getBoundingClientRect()
      let visible = intersect(rect, {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      })
      let parent = element.parentElement

      while (parent && parent !== main.parentElement) {
        const style = window.getComputedStyle(parent)
        const clips =
          /(auto|scroll|hidden|clip)/.test(style.overflowX) ||
          /(auto|scroll|hidden|clip)/.test(style.overflowY)

        if (clips) {
          const parentRect = parent.getBoundingClientRect()
          visible = intersect(visible, parentRect)
        }

        parent = parent.parentElement
      }

      return {
        left: visible.left,
        top: visible.top,
        right: visible.right,
        bottom: visible.bottom,
        width: Math.max(0, visible.right - visible.left),
        height: Math.max(0, visible.bottom - visible.top),
      }
    }

    const candidates = Array.from(
      main.querySelectorAll<HTMLElement>('h1,h2,h3,p,a,button,label,input,textarea,[data-status] p'),
    ).filter((element) => {
      const rect = visibleRectFor(element)
      const style = window.getComputedStyle(element)
      const text =
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.value || element.placeholder
          : element.textContent

      return (
        (text ?? '').replace(/\s+/g, ' ').trim().length > 2 &&
        rect.width > 1 &&
        rect.height > 1 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) > 0 &&
        !element.closest('.sr-only') &&
        element.getAttribute('aria-hidden') !== 'true' &&
        !element.classList.contains('icon') &&
        !element.classList.contains('material-symbols-outlined')
      )
    })

    const results: Array<{ first: string; second: string; area: number }> = []

    for (let index = 0; index < candidates.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < candidates.length; nextIndex += 1) {
        const first = candidates[index]
        const second = candidates[nextIndex]

        if (first.contains(second) || second.contains(first)) continue

        const firstRect = visibleRectFor(first)
        const secondRect = visibleRectFor(second)
        const overlapWidth = Math.max(
          0,
          Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left),
        )
        const overlapHeight = Math.max(
          0,
          Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top),
        )
        const area = Math.round(overlapWidth * overlapHeight)

        if (area > 12) {
          results.push({
            first: (first.textContent ?? first.getAttribute('aria-label') ?? '').trim().slice(0, 80),
            second: (second.textContent ?? second.getAttribute('aria-label') ?? '').trim().slice(0, 80),
            area,
          })
        }
      }
    }

    return results.slice(0, 5)
  })

  expect(overlaps).toEqual([])
}

async function expectNoOverlap(first: Locator, second: Locator) {
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()

  const [firstBox, secondBox] = await Promise.all([
    first.boundingBox(),
    second.boundingBox(),
  ])

  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()

  const a = firstBox!
  const b = secondBox!
  const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

  expect(Math.round(overlapWidth * overlapHeight)).toBe(0)
}

test.describe('plan-08 targeted visual QA and legacy gate', () => {
  test('TC-8.2 critical pages stay non-empty with key QA selectors across viewports', async ({ page }) => {
    for (const viewport of qaViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await mockVisualQaBase(page)

      await openRoute(page, '/')
      await expectPageNonEmpty(page)
      await expect(appShell(page)).toHaveAttribute('data-variant', 'landing')
      await expect(page.getByTestId('app-shell-primary-nav')).toHaveCount(1)
      if (viewport.width >= 768) {
        await expect(page.getByTestId('app-shell-primary-nav')).toBeVisible()
      }

      await openRoute(page, '/workspace')
      await expectPageNonEmpty(page)
      await expect(appShell(page)).toHaveAttribute('data-variant', 'workspace')
      await expect(appShell(page).getByTestId('ai-status-header').first()).toBeVisible()
      await expect(appShell(page).getByTestId('workspace-three-column-layout').first()).toBeVisible()
      await expect(appShell(page).getByTestId('reference-card').first()).toBeVisible()
      await expect(appShell(page).getByTestId('recipe-card').first()).toBeVisible()
      await expect(appShell(page).getByTestId('prompt-card').first()).toBeVisible()
      await expect(appShell(page).getByTestId('output-card').first()).toBeVisible()
      await expect(appShell(page).getByTestId('history-strip').first()).toBeVisible()

      await openRoute(page, '/workspace/templates')
      await expectPageNonEmpty(page)
      await expect(appShell(page)).toHaveAttribute('data-variant', 'memory')
      await expect(page.getByRole('heading', { name: /^Style Memory$/i })).toBeVisible()
      await expect(page.getByRole('heading', { name: /^Template Library$/i })).toHaveCount(0)
    }
  })

  test('TC-8.2/TC-8.3 analysis_ready layout has no text overlap or button overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWorkspaceWithAnalysisReady(page, 'visual-qa-analysis-ready')

    await expect(promptEditor(page)).toBeVisible()
    await expect(renderDock(page)).toBeVisible()
    await expectNoOverlap(renderDock(page), promptEditor(page))
    await expectVisibleTextDoesNotOverlap(page)
    await expectButtonsDoNotOverflow(appShell(page))

    for (const viewport of qaViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await expectPageNonEmpty(page)
      await expect(appShell(page).getByTestId('reference-card').first()).toBeVisible()
      await expect(appShell(page).getByTestId('recipe-card').first()).toBeVisible()
      await expect(appShell(page).getByTestId('prompt-card').first()).toBeVisible()
      await expect(appShell(page).getByTestId('output-card').first()).toBeVisible()
    }
  })

  test('TC-8.3 generation failed keeps compact Render Dock from covering Prompt', async ({ page }) => {
    const generationTaskId = 'visual-qa-generation-failed'
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockGenerationCreate(page, generationTaskId)
    await mockGenerationPolling(page, generationTaskId, {
      id: generationTaskId,
      analysisTaskId: 'visual-qa-generation-analysis',
      status: 'failed',
      promptSnapshot: 'Visual QA preserved prompt snapshot',
      negativePromptSnapshot: 'low quality',
      params: { aspectRatio: '1:1', quality: 'standard' },
      modelName: 'flux.2',
      resultAssetId: null,
      resultFileUrl: null,
      errorMessage: 'Generation provider failed after queueing',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:05.000Z',
    })

    await openWorkspaceWithAnalysisReady(page, 'visual-qa-generation-analysis')
    await renderDock(page).getByRole('button', { name: /^Generate$/i }).click()

    const dialog = page.getByTestId('generation-dialog')
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await expect(dialog).toContainText(/Generation Failed/i)
    await dialog.getByRole('button', { name: /close dialog/i }).click()
    await expect(dialog).toHaveCount(0)

    await expect(renderDock(page).getByTestId('render-recovery-actions')).toHaveCount(0)
    await expect(renderDock(page).locator('[data-testid^="render-readiness-item-"]')).toHaveCount(0)
    await expect(promptEditor(page)).toBeVisible()
    await expectButtonsDoNotOverflow(renderDock(page))
  })

  test('TC-8.4 populated Style Memory cards expose final QA selector and avoid legacy file-list copy', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockVisualQaBase(page)

    await openRoute(page, '/workspace/templates')

    await expect(page.locator('.style-memory-card').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: styleMemories[0].name })).toBeVisible()
    await expect(page.getByText(/Style tags/i).first()).toBeVisible()
    await expect(page.getByText(/Reuse intent/i).first()).toBeVisible()
    await expect(page.getByText(/No templates yet/i)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /^Template Library$/i })).toHaveCount(0)

    await expect(page.getByTestId('style-memory-card').first()).toBeVisible()
  })

  test('TC-8.4/TC-8.5 Style Memory state actions stay visible in empty, noResults, and authRequired states', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockVisualQaBase(page, [])

    await openRoute(page, '/workspace/templates')

    const emptyState = statePresenter(page, 'empty')
    await expect(emptyState).toBeVisible()
    await expect(emptyState.getByRole('button').first()).toBeVisible()
    await expectButtonsDoNotOverflow(emptyState)

    const noResultsPage = await page.context().newPage()
    await noResultsPage.setViewportSize({ width: 1280, height: 800 })
    await mockVisualQaBase(noResultsPage, styleMemories)
    await openRoute(noResultsPage, '/workspace/templates')
    const searchBox = noResultsPage.getByRole('textbox')
    await searchBox.click()
    await noResultsPage.keyboard.type('no matching visual qa memory')
    await expect(searchBox).toHaveValue('no matching visual qa memory')

    const noResultsState = statePresenter(noResultsPage, 'noResults')
    await expect(noResultsState).toBeVisible({ timeout: 10000 })
    await expect(noResultsState.getByRole('button', { name: /clear search/i })).toBeVisible()
    await expect(noResultsState.getByRole('button', { name: /back to workspace/i })).toBeVisible()
    await expectButtonsDoNotOverflow(noResultsState)
    await noResultsPage.close()

    const authPage = await page.context().newPage()
    await authPage.setViewportSize({ width: 1280, height: 800 })
    await mockAuthSession(authPage)
    await mockGenerationList(authPage)
    await mockApiError(authPage, '**/api/templates?**', 401, {
      error: 'Authentication required',
    })
    await openRoute(authPage, '/workspace/templates')

    const authState = statePresenter(authPage, 'authRequired')
    await expect(authState).toBeVisible()
    await expect(authState.getByRole('button', { name: /log in|sign in|login/i })).toBeVisible()
    await expect(authState.getByRole('button', { name: /back to workspace/i })).toBeVisible()
    await expectButtonsDoNotOverflow(authState)
    await authPage.close()
  })
})
