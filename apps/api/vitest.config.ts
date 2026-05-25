import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    globalSetup: 'src/test/global-setup.ts',
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 15000,
    // vmForks = separate OS processes (same ioredis isolation as 'forks') but uses
    // Vite's module system, so @fastify/autoload can load .ts route files via
    // Vite's esbuild transform instead of Node's native require().
    pool: 'vmForks',
    fileParallelism: false, // test files share a DB — run sequentially
    exclude: ['node_modules', 'dist'],
  },
});
