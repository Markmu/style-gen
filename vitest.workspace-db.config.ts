import { defineConfig } from 'vitest/config';
import base from './vitest.config';
export default defineConfig({ ...base, test: { ...base.test, include: ['src/**/__tests__/*.integration.test.ts'], exclude: ['node_modules', '.next', 'e2e'], passWithNoTests: false, fileParallelism: false } });
