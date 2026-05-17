import { expect, test } from '@playwright/test'

test.describe('FEAT-03 Precision Glass home', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('first viewport exposes value, actions, product preview, and upload entry', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: /Reference Image Style Recreation/ }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /Start Creating/ }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Template Library/ }).first()).toBeVisible()
    await expect(page.getByText('Reference', { exact: true })).toBeVisible()
    await expect(page.getByText('Recipe', { exact: true })).toBeVisible()
    await expect(page.getByText('Render', { exact: true })).toBeVisible()
    await expect(page.getByText('Click or drag to upload a reference image')).toBeVisible()
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
        page.getByRole('heading', { name: 'Recreate a Style in Three Steps' }),
      ).toBeVisible()
    })
  }
})
