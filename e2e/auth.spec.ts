import { test, expect } from '@playwright/test'

test.describe('认证流程 - 未登录拦截', () => {
  test('未登录访问 /workspace 重定向到 /', async ({ page }) => {
    // 直接访问 /workspace，期望被 middleware 重定向到 /
    const response = await page.goto('/workspace')

    // 最终 URL 应该是首页
    expect(page.url()).not.toContain('/workspace')
    expect(new URL(page.url()).pathname).toBe('/')

    // 验证首页正常加载
    await expect(page.locator('h1')).toContainText('参考图风格再创作')

    // 验证 response 表明发生了重定向
    // middleware 返回 302 重定向，Playwright 自动跟随
    expect(response).not.toBeNull()
  })

  test('未登录调用 POST /api/analysis 返回 401', async ({ request }) => {
    const response = await request.post('/api/analysis', {
      data: {
        assetId: 'test-asset-id',
        fileUrl: 'https://example.com/test.png',
        width: 100,
        height: 100,
        mimeType: 'image/png',
      },
    })

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.code).toBe('UNAUTHORIZED')
    expect(body.retryable).toBe(false)
  })

  test('未登录调用 POST /api/generation 返回 401', async ({ request }) => {
    const response = await request.post('/api/generation', {
      data: {
        analysisTaskId: 'test-task-id',
        promptText: 'test prompt',
        negativePromptText: '',
        params: { aspectRatio: '1:1', quality: 'standard' },
      },
    })

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.code).toBe('UNAUTHORIZED')
    expect(body.retryable).toBe(false)
  })

  test('未登录调用 POST /api/upload/presign 返回 401', async ({ request }) => {
    const response = await request.post('/api/upload/presign', {
      data: {
        fileName: 'test.png',
        mimeType: 'image/png',
      },
    })

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.code).toBe('UNAUTHORIZED')
    expect(body.retryable).toBe(false)
  })

  test('未登录调用 GET /api/analysis/:id 返回 401', async ({ request }) => {
    const response = await request.get('/api/analysis/some-task-id')

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.code).toBe('UNAUTHORIZED')
  })

  test('未登录调用 GET /api/generation/:id 返回 401', async ({ request }) => {
    const response = await request.get('/api/generation/some-task-id')

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.code).toBe('UNAUTHORIZED')
  })
})

test.describe('首页展示', () => {
  test('首页正常展示标题和描述', async ({ page }) => {
    await page.goto('/')

    // 验证首页标题
    await expect(page.locator('h1')).toContainText('参考图风格再创作')

    // 验证描述文案
    await expect(
      page.getByText('上传参考图，AI 提取视觉配方，一键生成同风格新图')
    ).toBeVisible()
  })

  test('首页包含登录按钮', async ({ page }) => {
    await page.goto('/')

    // AuthHeader 中未登录时应显示 LoginButton
    const loginButton = page.getByRole('button', { name: '登录' })
    await expect(loginButton).toBeVisible()
  })

  test('首页 CTA 区域可见', async ({ page }) => {
    await page.goto('/')

    // UploadEntry 组件应该可见（CTA 入口）
    // 首页有两个 UploadEntry 实例
    const fileInputs = page.locator('input[type="file"]')
    const count = await fileInputs.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('Auth.js 公开路由可访问', async ({ request }) => {
    // /api/auth/* 路由不需要认证（在 PUBLIC_API_PREFIXES 中）
    const response = await request.get('/api/auth/providers')

    expect(response.status()).toBe(200)
    const body = await response.json()
    // 应该返回配置的 Google Provider
    expect(body).toHaveProperty('google')
  })
})
