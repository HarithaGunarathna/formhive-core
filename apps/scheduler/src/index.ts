// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import cron from 'node-cron';
import { EventBus } from '@formhive/events';
import { runReminderDispatch } from './jobs/reminderDispatcher';
import { runCampaignCloser } from './jobs/campaignCloser';

const REDIS_URL = process.env['REDIS_URL'];
if (!REDIS_URL) throw new Error('REDIS_URL environment variable is not set');

const FORM_BASE_URL = process.env['FORM_BASE_URL'];
if (!FORM_BASE_URL) throw new Error('FORM_BASE_URL environment variable is not set');

const eventBus = new EventBus(REDIS_URL);

console.log('[scheduler] service starting…');

cron.schedule('*/5 * * * *', () => runReminderDispatch(eventBus, FORM_BASE_URL));
console.log('[scheduler] reminder dispatcher scheduled (every 5 minutes)');

cron.schedule('0 * * * *', () => runCampaignCloser());
console.log('[scheduler] campaign closer scheduled (every hour)');
