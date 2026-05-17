import { expect, test } from '@playwright/test'

test.describe('FEAT-02 Precision Glass shell', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('top navigation uses unified Visoryn brand and page entries', async ({ page }) => {
    await page.goto('/')

    const header = page.getByRole('banner')
    await expect(header.getByRole('link', { name: /Visoryn/ })).toBeVisible()
    await expect(header.getByRole('link', { name: /Home/ })).toBeVisible()
    await expect(header.getByRole('link', { name: /Workspace/ })).toBeVisible()
    await expect(header.getByRole('link', { name: /Template Library/ })).toBeVisible()
    await expect(header.getByText('StyleGen')).toHaveCount(0)
  })

  test('workspace sidebar marks Library as current on templates page', async ({ page }) => {
    await page.goto('/workspace/templates')

    const sidebar = page.getByRole('complementary', { name: /Workspace navigation/ })
    await expect(sidebar.getByRole('button', { name: /Library/ })).toHaveAttribute(
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
      await page.goto(path)

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )

      expect(hasHorizontalOverflow).toBe(false)
    })
  }
})
