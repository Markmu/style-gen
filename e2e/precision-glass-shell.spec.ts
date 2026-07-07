import { expect, test, type Page } from '@playwright/test'
import {
  mockAuthSession,
  mockGenerationList,
  mockTemplateCollection,
} from './helpers/mock-api'

async function mockShellApis(page: Page) {
  await mockAuthSession(page)
  await mockGenerationList(page)
  await mockTemplateCollection(page)
}

test.describe('Phase 12 AI-first shell compatibility', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('workspace top navigation uses unified Visoryn brand and page entries', async ({ page }) => {
    await mockShellApis(page)
    await page.goto('/workspace')

    const header = page.getByRole('banner')
    await expect(header.getByRole('link', { name: /Visoryn/ })).toBeVisible()
    await expect(header.getByRole('link', { name: /Home/ })).toBeVisible()
    await expect(header.getByRole('link', { name: /Workspace/ })).toBeVisible()
    await expect(header.getByRole('link', { name: /Style Memory/ })).toBeVisible()
    await expect(header.getByText(/Template Library/i)).toHaveCount(0)
    await expect(header.getByText('StyleGen')).toHaveCount(0)
  })

  test('workspace sidebar marks Style Memory as current on templates page', async ({ page }) => {
    await mockShellApis(page)
    await page.goto('/workspace/templates')

    const sidebar = page.getByRole('complementary', { name: /Workspace navigation/ })
    await expect(sidebar.getByRole('button', { name: /Style Memory/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(sidebar.getByRole('button', { name: /Generate/ })).not.toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  for (const path of ['/', '/workspace', '/workspace/templates']) {
    test(`keeps ${path} within desktop viewport width`, async ({ page }) => {
      await mockShellApis(page)
      await page.goto(path)

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )

      expect(hasHorizontalOverflow).toBe(false)
    })
  }
})
