import type { Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadFixture(name: string): object {
  const filePath = resolve(__dirname, '../fixtures/api-responses', name)
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

/** Mock next-auth session API — makes useSession() return an authenticated user */
export async function mockAuthSession(
  page: Page,
  user?: { name?: string; email?: string; id?: string; image?: string }
) {
  const mockUser = {
    name: user?.name ?? 'Test User',
    email: user?.email ?? 'test@example.com',
    id: user?.id ?? 'mock-user-id',
    image: user?.image ?? null,
  }

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: mockUser,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
  })
}

/** Mock presign API — returns a fixed presigned URL and file URL */
export async function mockUploadPresign(page: Page, assetId = 'mock-asset-id') {
  await page.route('**/api/upload/presign', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          presignedUrl: 'https://r2.example.com/presigned-upload-url',
          fileUrl: `https://cdn.example.com/references/${assetId}/original.png`,
          assetId,
        }),
      })
    } else {
      await route.continue()
    }
  })

  // Mock the R2 PUT upload
  await page.route('https://r2.example.com/**', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 200, body: '' })
    } else {
      await route.continue()
    }
  })
}

/** Mock analysis POST — returns a task in pending state */
export async function mockAnalysisCreate(
  page: Page,
  taskId = 'mock-analysis-task-id',
) {
  await page.route('**/api/analysis', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: taskId,
          status: 'pending',
          sourceAssetId: 'mock-asset-id',
          recipe: null,
          promptText: null,
          negativePromptText: null,
          rawResponse: null,
          errorMessage: null,
          errorStage: null,
        }),
      })
    } else {
      await route.continue()
    }
  })
}

/** Mock analysis polling GET — returns a fixed response */
export async function mockAnalysisPolling(
  page: Page,
  taskId: string,
  response: object,
) {
  await page.route(`**/api/analysis/${taskId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    })
  })
}

/** Mock analysis polling GET with sequence of responses */
export async function mockAnalysisPollingSequence(
  page: Page,
  taskId: string,
  responses: object[],
) {
  let callIndex = 0
  await page.route(`**/api/analysis/${taskId}`, async (route) => {
    const response = responses[Math.min(callIndex, responses.length - 1)]
    callIndex++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    })
  })
}

/** Mock generation POST — returns task in pending state */
export async function mockGenerationCreate(
  page: Page,
  taskId = 'mock-generation-task-id',
) {
  await page.route('**/api/generation', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: taskId, status: 'pending' }),
      })
    } else {
      await route.continue()
    }
  })
}

/** Mock generation polling GET — returns a fixed response */
export async function mockGenerationPolling(
  page: Page,
  taskId: string,
  response: object,
) {
  await page.route(`**/api/generation/${taskId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    })
  })
}

/** Mock generation polling GET with sequence of responses */
export async function mockGenerationPollingSequence(
  page: Page,
  taskId: string,
  responses: object[],
) {
  let callIndex = 0
  await page.route(`**/api/generation/${taskId}`, async (route) => {
    const response = responses[Math.min(callIndex, responses.length - 1)]
    callIndex++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    })
  })
}

/** Mock API error response */
export async function mockApiError(
  page: Page,
  urlPattern: string,
  status: number,
  body: object,
  headers?: Record<string, string>,
) {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
      headers,
    })
  })
}

/** Load fixture data */
export { loadFixture }
