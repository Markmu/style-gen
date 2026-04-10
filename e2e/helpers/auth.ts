import type { Page } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'

/**
 * 真实认证 Helper — 为 E2E 测试注入有效 NextAuth session Cookie
 *
 * 原理：NextAuth v5 (Auth.js) 的 JWT session 默认不是 HS256 签名 JWT，
 * 而是使用 `next-auth/jwt.encode()` 生成的加密 JWE，且 salt 与 cookie 名绑定。
 * 本模块直接复用官方 encode 实现，确保服务端 auth() 能真正通过。
 */

const AUTHJS_SESSION_COOKIE = 'authjs.session-token'

function getAuthSecret(): string {
  // 相对于项目根目录（CWD 为项目根）
  const candidates = [
    `${process.cwd()}/.env.local`,
    `${process.cwd()}/.env`,
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf-8')
      const match = content.match(/^AUTH_SECRET=(.+)$/m)
      if (match) return match[1].trim().replace(/^['"]|['"]$/g, '')
    }
  }
  throw new Error('AUTH_SECRET not found in .env.local or .env')
}

/** 使用 NextAuth v5 官方实现生成可被 auth() 解密的 session token */
async function createNextAuthToken(
  payload: Record<string, unknown>,
  maxAge: number,
): Promise<string> {
  const { encode } = await import('next-auth/jwt')

  return encode({
    secret: getAuthSecret(),
    salt: AUTHJS_SESSION_COOKIE,
    maxAge,
    token: payload,
  })
}

/**
 * 注入真实 NextAuth session Cookie + mock 客户端 session endpoint
 *
 * 替代 mockAuthSession — 让服务端 API 路由的 auth() 真正通过。
 */
/** 数据库中已存在的真实用户 ID（模板 CRUD 需要外键关联） */
const REAL_USER_ID = '01KMZRJR18K0KHCRX3RGX6REPW'
const REAL_USER_EMAIL = 'muchao1303@gmail.com'
const REAL_USER_NAME = 'Mark Mu'

export async function authenticateTestUser(
  page: Page,
  user?: { name?: string; email?: string; id?: string; image?: string },
) {
  const userId = user?.id ?? REAL_USER_ID
  const maxAge = 7 * 24 * 60 * 60 // 7 天
  const expiresAt = Math.floor(Date.now() / 1000) + maxAge

  // 生成官方格式 JWE，并写入 Auth.js 默认 session cookie
  const token = await createNextAuthToken({
    sub: userId,
    userId,
    name: user?.name ?? REAL_USER_NAME,
    email: user?.email ?? REAL_USER_EMAIL,
    picture: user?.image ?? null,
    avatarUrl: user?.image ?? null,
  }, maxAge)

  await page.context().addCookies([
    {
      name: AUTHJS_SESSION_COOKIE,
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      expires: expiresAt,
    },
  ])

  // Mock 客户端 session endpoint（useSession() 依赖此端点）
  const mockUser = {
    name: user?.name ?? REAL_USER_NAME,
    email: user?.email ?? REAL_USER_EMAIL,
    id: userId,
    image: user?.image ?? null,
  }

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: mockUser,
        expires: new Date(Date.now() + maxAge * 1000).toISOString(),
      }),
    })
  })
}
