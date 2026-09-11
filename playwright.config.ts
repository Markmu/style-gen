import { defineConfig, devices } from '@playwright/test'
import { writeFileSync } from 'node:fs'

// Each auth mode has its own Next compiler cache and generated type tree.
for(const suffix of ['a3000','a3001'])writeFileSync(`.next-workspace-test-${suffix}.tsconfig.json`,JSON.stringify({extends:'./tsconfig.json',include:['next-env.d.ts','src/**/*.ts','src/**/*.tsx',`.next-workspace-test-${suffix}/types/**/*.ts`],exclude:['node_modules']},null,2));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Next dev occasionally serves transient 404s under high parallelism.
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'auth',
      testMatch: ['auth.spec.ts', 'data-isolation.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
      },
    },
    {
      name: 'workspace',
      testIgnore: ['auth.spec.ts', 'data-isolation.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3001',
      },
    },
  ],
  webServer: [
    {
      command: 'WORKSPACE_TEST_DIST_DIR=.next-workspace-test-a3000 pnpm dev --port 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'WORKSPACE_TEST_DIST_DIR=.next-workspace-test-a3001 AUTH_REQUIRED=false pnpm dev --port 3001',
      url: 'http://localhost:3001',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
})
