// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { beforeEach } from 'vitest';
import { cleanDb } from './setup';

beforeEach(async () => {
  await cleanDb();
});
