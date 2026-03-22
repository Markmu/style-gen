import { test, expect } from '@playwright/test'

test('应用首页可以加载', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/.+/)
})
