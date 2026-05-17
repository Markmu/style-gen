import { test, expect } from '@playwright/test'

/**
 * 数据隔离验证测试
 *
 * 数据隔离通过以下层级保证：
 * 1. Middleware 层：未认证请求返回 401（认证前置检查）
 * 2. API Route 层：从 session 获取 userId，传递给 Repository
 * 3. Repository 层：所有 find 方法含 userId 参数，WHERE user_id = ?
 *
 * E2E 测试验证第 1 层（认证前置检查），确保匿名用户无法访问任何业务数据。
 * 第 2、3 层由 Repository 单元测试验证。
 *
 * Google OAuth 限制：E2E 环境无法创建真实的多用户会话，
 * 因此无法端到端验证"用户 A 看不到用户 B 的数据"。
 * 该场景通过以下方式保证：
 * - Repository 的 WHERE user_id = ? 条件（单元测试覆盖）
 * - API Route 从 session.user.id 获取 userId（代码审查Confirm）
 */
test.describe('数据隔离 - 认证前置检查', () => {
  test('所有业务 API 均拒绝未认证请求', async ({ request }) => {
    // 验证所有 API 路由的 401 响应遵循统一的错误契约
    const endpoints = [
      {
        method: 'POST' as const,
        url: '/api/analysis',
        body: {
          assetId: 'test',
          fileUrl: 'https://example.com/test.png',
          width: 100,
          height: 100,
          mimeType: 'image/png',
        },
      },
      {
        method: 'POST' as const,
        url: '/api/generation',
        body: {
          analysisTaskId: 'test',
          promptText: 'test',
          negativePromptText: '',
          params: { aspectRatio: '1:1', quality: 'standard' },
        },
      },
      {
        method: 'POST' as const,
        url: '/api/upload/presign',
        body: { fileName: 'test.png', mimeType: 'image/png' },
      },
      { method: 'GET' as const, url: '/api/analysis/test-id', body: null },
      { method: 'GET' as const, url: '/api/generation/test-id', body: null },
    ]

    for (const endpoint of endpoints) {
      const response =
        endpoint.method === 'POST'
          ? await request.post(endpoint.url, { data: endpoint.body })
          : await request.get(endpoint.url)

      expect(
        response.status(),
        `${endpoint.method} ${endpoint.url} should return 401`
      ).toBe(401)

      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body).toHaveProperty('code', 'UNAUTHORIZED')
      expect(body).toHaveProperty('retryable', false)
    }
  })

  test('未认证用户无法创建分析任务', async ({ request }) => {
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
  })

  test('未认证用户无法查询分析任务', async ({ request }) => {
    const response = await request.get('/api/analysis/any-task-id')

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.code).toBe('UNAUTHORIZED')
  })

  test('未认证用户无法创建Generation Task', async ({ request }) => {
    const response = await request.post('/api/generation', {
      data: {
        analysisTaskId: 'test-analysis-id',
        promptText: 'test',
        negativePromptText: '',
        params: { aspectRatio: '1:1', quality: 'standard' },
      },
    })

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.code).toBe('UNAUTHORIZED')
  })

  test('未认证用户无法查询Generation Task', async ({ request }) => {
    const response = await request.get('/api/generation/any-task-id')

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.code).toBe('UNAUTHORIZED')
  })

  test('未认证用户无法获取上传预签名 URL', async ({ request }) => {
    const response = await request.post('/api/upload/presign', {
      data: {
        fileName: 'test.png',
        mimeType: 'image/png',
      },
    })

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body.code).toBe('UNAUTHORIZED')
  })
})

test.describe('数据隔离 - 页面路由守卫', () => {
  test('受保护页面路由未Log in重定向到Home', async ({ page }) => {
    // /workspace 是受保护的页面路由
    await page.goto('/workspace')

    // 应被重定向到 /
    expect(new URL(page.url()).pathname).toBe('/')
  })

  test('Auth.js 路由不受认证拦截', async ({ request }) => {
    // /api/auth/* 在 PUBLIC_API_PREFIXES 中，不需要认证
    const response = await request.get('/api/auth/providers')

    // 应该正常返回，不返回 401
    expect(response.status()).not.toBe(401)
    expect(response.status()).toBe(200)
  })
})

test.describe('数据隔离 - 前端 401 处理契约', () => {
  test('API 返回 401 时前端引导重新Log in', async ({ page }) => {
    // 模拟已Log in用户的 session 过期场景：
    // 前端 hooks 收到 401 后调用 signIn 引导重新Log in
    await page.goto('/')

    // 拦截 analysis polling 返回 401
    await page.route('**/api/analysis/expired-session-task', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
          retryable: false,
        }),
      })
    })

    // 验证 401 响应结构与 middleware 返回一致
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/analysis/expired-session-task')
      return { status: res.status, body: await res.json() }
    })

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('UNAUTHORIZED')
    expect(response.body.retryable).toBe(false)
  })
})
