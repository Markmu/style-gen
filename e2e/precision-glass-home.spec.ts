import { expect, test } from '@playwright/test'

test.describe('FEAT-03 Precision Glass home', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('first viewport exposes value, actions, product preview, and upload entry', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: /参考图风格再创作/ }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /开始创作/ }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /模板库/ }).first()).toBeVisible()
    await expect(page.getByText('Reference')).toBeVisible()
    await expect(page.getByText('Recipe')).toBeVisible()
    await expect(page.getByText('Render')).toBeVisible()
    await expect(page.getByText('点击或拖拽上传参考图')).toBeVisible()
  })

  test('invalid upload stays in place and offers recovery', async ({ page }) => {
    await page.goto('/')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    })

    await expect(page.getByText('仅支持 JPG、PNG、WebP 格式的图片')).toBeVisible()
    await expect(page.getByRole('button', { name: /重新选择/ })).toBeVisible()
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
      await expect(page.getByText(/三步完成|Surface -> State -> Action/)).toBeVisible()
    })
  }
})
