// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { EventBus, SUBMISSIONS_STREAM } from '@formhive/events';
import { createHandler } from './handler';

const REDIS_URL = process.env['REDIS_URL'];
if (!REDIS_URL) throw new Error('REDIS_URL environment variable is not set');

async function main(): Promise<void> {
  console.log('[validator] service starting…');
  const eventBus = new EventBus(REDIS_URL as string);
  await eventBus.consume(
    SUBMISSIONS_STREAM,
    'validator-group',
    'validator-1',
    createHandler(eventBus),
  );
}

main().catch((err) => {
  console.error('[validator] fatal error:', err);
  process.exit(1);
});
