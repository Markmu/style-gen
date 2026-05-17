import { test, expect } from '@playwright/test'

test('应用Home可以加载', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/.+/)
})
