import { expect, test, type Page } from '@playwright/test'
import { mockAuthSession } from './helpers/mock-api'
import { waitForReactElement } from './helpers/react-ready'

const AI_FIRST_TOKEN_CONTRACT = [
  '--surface-evidence-panel',
  '--surface-evidence-chip',
  '--evidence-color-bg',
  '--evidence-color-text',
  '--evidence-composition-bg',
  '--evidence-lighting-bg',
  '--evidence-texture-bg',
  '--evidence-mood-bg',
  '--evidence-neutral-bg',
  '--readiness-ready-bg',
  '--readiness-waiting-bg',
  '--readiness-blocked-bg',
  '--readiness-processing-bg',
  '--style-memory-card-bg',
  '--style-memory-source-bg',
  '--status-neutral-bg',
  '--status-warning-bg',
  '--status-danger-bg',
]

async function openWorkspace(page: Page) {
  try {
    await page.goto('/workspace', { waitUntil: 'commit', timeout: 10000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ERR_ABORTED') && !message.includes('Timeout')) {
      throw error
    }
  }

  await expect(page.locator('body')).toBeVisible({ timeout: 15000 })
}

test.describe('plan-01 AI-first design system baseline', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page)
  })

  test('TC-1.1 exposes DesignTokenLayer AI semantic tokens on the workspace shell', async ({ page }) => {
    await openWorkspace(page)

    await expect(page.getByRole('complementary', { name: /Workspace navigation/i })).toBeVisible()

    const missingTokens = await page.evaluate((tokens) => {
      const roots = [
        document.documentElement,
        document.body,
        document.querySelector('.workspace-chromatic'),
      ].filter((element): element is Element => Boolean(element))

      return tokens.filter((token) =>
        roots.every((element) => getComputedStyle(element).getPropertyValue(token).trim() === ''),
      )
    }, AI_FIRST_TOKEN_CONTRACT)

    expect(
      missingTokens,
      `Missing plan-01 AI-first CSS custom properties: ${missingTokens.join(', ')}`,
    ).toEqual([])
  })

  test('TC-1.2 renders AI-first status language in the landing status preview', async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' })

    const statusPreview = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /Every State Stays Clear/i }) })

    await expect(statusPreview).toBeVisible()

    const analyzingStatus = statusPreview.locator('.landing-status-row').filter({ hasText: 'Analyzing' })
    await expect(analyzingStatus).toContainText(/AI|style signals|reference/i)
    await expect(analyzingStatus).toContainText(/color|composition|lighting|texture|mood/i)

    const recoverableStatus = statusPreview
      .locator('.landing-status-row')
      .filter({ hasText: 'Recoverable Failure' })

    await expect(recoverableStatus).toContainText(/reference|prompt|context/i)
    await expect(recoverableStatus).toContainText(/preserved|kept|still available/i)
    await expect(recoverableStatus).toContainText(/retry|return|back to edit|next/i)
  })

  test('TC-1.3 keeps semantic hierarchy in light and dark system themes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await openWorkspace(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    const readThemeTokens = () =>
      page.getByTestId('app-shell').evaluate((shell) => {
        const styles = getComputedStyle(shell)
        return {
          surface: styles.getPropertyValue('--surface-page').trim(),
          panel: styles.getPropertyValue('--surface-panel').trim(),
          text: styles.getPropertyValue('--text-primary').trim(),
          accent: styles.getPropertyValue('--accent-primary').trim(),
          colorScheme: styles.colorScheme,
        }
      })

    const light = await readThemeTokens()

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const dark = await readThemeTokens()

    expect(light.surface).not.toBe(dark.surface)
    expect(light.panel).not.toBe(dark.panel)
    expect(light.text).not.toBe(dark.text)
    expect(light.accent).not.toBe(dark.accent)
    expect(dark.colorScheme).toContain('dark')
    await expect(page.getByTestId('workspace-three-column-layout')).toBeVisible()
  })

  test('TC-1.4 persists an explicit theme and can return to the system theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/', { waitUntil: 'commit' })

    const systemThemeButton = page.getByRole('button', { name: /theme: follow system/i })
    await waitForReactElement(systemThemeButton)
    await systemThemeButton.click()
    await page.getByRole('menuitemradio', { name: /^dark/i }).click()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'dark')
    await expect(page.getByRole('button', { name: /theme: dark/i })).toBeVisible()

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload({ waitUntil: 'commit' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: /theme: dark/i })).toBeVisible()

    const darkThemeButton = page.getByRole('button', { name: /theme: dark/i })
    await waitForReactElement(darkThemeButton)
    await darkThemeButton.click()
    await page.getByRole('menuitemradio', { name: /follow system/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system')
  })
})
