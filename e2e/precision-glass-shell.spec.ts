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

  // 现行 workspace 外壳：站点级顶栏仅存在于非 workspace 路由，workspace 的
  // 统一品牌与页面入口由左侧 "Workspace navigation" 侧栏承载
  test('workspace navigation uses unified Visoryn brand and page entries', async ({ page }) => {
    await mockShellApis(page)
    await page.goto('/workspace')

    const sidebar = page.getByRole('complementary', { name: /Workspace navigation/ })
    const brandLink = sidebar.getByRole('link', { name: /Visoryn/ })
    await expect(brandLink).toBeVisible()
    await expect(brandLink).toHaveAttribute('href', '/')
    await expect(sidebar.getByRole('link', { name: 'Generate' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Style Memory Library' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Iterations' })).toBeVisible()
    await expect(sidebar.getByText(/Template Library/i)).toHaveCount(0)
    await expect(page.getByText('StyleGen')).toHaveCount(0)
  })

  test('workspace sidebar marks Style Memory as current on templates page', async ({ page }) => {
    await mockShellApis(page)
    await page.goto('/workspace/templates')

    const sidebar = page.getByRole('complementary', { name: /Workspace navigation/ })
    const styleMemoryNav = sidebar.getByRole('link', { name: 'Style Memory Library' })
    await expect(styleMemoryNav).toHaveAttribute('aria-current', 'page')
    await expect(styleMemoryNav).toHaveAttribute('data-active', 'true')
    await expect(sidebar.getByRole('link', { name: 'Generate' })).not.toHaveAttribute(
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
