import { expect, test } from '@playwright/test'

test.describe('Phase 12 AI-first home compatibility', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('first viewport exposes AI-first value, actions, product preview, and upload entry', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: /Reference\s*->\s*Evidence\s*->\s*Render/ }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /Upload reference/ }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Browse Style Memory/ }).first()).toBeVisible()
    await expect(page.getByText(/Template Library/i)).toHaveCount(0)
    const productPreview = page.getByLabel('Reference Evidence Render preview')
    await expect(productPreview.getByText('Reference', { exact: true })).toBeVisible()
    await expect(productPreview.getByText('Evidence', { exact: true })).toBeVisible()
    await expect(productPreview.getByText('Render', { exact: true })).toBeVisible()
    await expect(page.getByText('Upload a reference image')).toBeVisible()
  })

  test('invalid upload stays in place and offers recovery', async ({ page }) => {
    await page.goto('/')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    })

    await expect(page.getByText('Only JPG, PNG, and WebP images are supported')).toBeVisible()
    await expect(page.getByRole('button', { name: /Choose Again/ })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  for (const width of [1280, 1440]) {
    test(`keeps home stable at ${width}px and hints next section`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )

      expect(hasHorizontalOverflow).toBe(false)
      await expect(
        page.getByRole('heading', { name: 'The workbench keeps AI decisions inspectable' }),
      ).toBeVisible()
    })
  }
})
