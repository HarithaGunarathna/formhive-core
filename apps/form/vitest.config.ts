// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    globalSetup: 'src/test/global-setup.ts',
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 15000,
    pool: 'vmForks',
    fileParallelism: false,
  },
});
