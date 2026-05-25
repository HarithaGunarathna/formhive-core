// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import 'dotenv/config';
import { EventBus } from '@formhive/events';
import { runReminderDispatch } from '../jobs/reminderDispatcher';

const REDIS_URL = process.env['REDIS_URL'];
const FORM_BASE_URL = process.env['FORM_BASE_URL'];

if (!REDIS_URL) {
  console.error('[trigger] REDIS_URL environment variable is not set');
  process.exit(1);
}

if (!FORM_BASE_URL) {
  console.error('[trigger] FORM_BASE_URL environment variable is not set');
  process.exit(1);
}

const eventBus = new EventBus(REDIS_URL);

console.log('[trigger] Running reminder dispatch now...');
runReminderDispatch(eventBus, FORM_BASE_URL)
  .then(() => {
    console.log('[trigger] Done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[trigger] Error:', err);
    process.exit(1);
  });