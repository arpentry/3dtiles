import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Increase timeout for tests that need to process TIFF files
    testTimeout: 30000,
    // Setup file for test utilities
    setupFiles: ['./src/test-setup.ts'],
    // Pool options for node environment
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: false
      }
    }
  }
}) 