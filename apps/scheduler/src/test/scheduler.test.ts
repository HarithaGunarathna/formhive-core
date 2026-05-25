// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { describe, it, expect, beforeEach } from 'vitest';
import { db, campaigns, submissions, campaignReminderLog } from '@formhive/db';
import { eq, and } from 'drizzle-orm';
import { EventBus, EventName, NOTIFICATIONS_STREAM } from '@formhive/events';
import { runReminderDispatch } from '../jobs/reminderDispatcher';
import { runCampaignCloser } from '../jobs/campaignCloser';
import { cleanDb, seedTestData, redis } from './setup';
import { waitFor } from './helpers/waitFor';

const REDIS_URL = process.env['REDIS_URL'] as string;
const FORM_BASE_URL = 'http://localhost:3001';

function toFieldMap(fields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) map[fields[i]] = fields[i + 1];
  return map;
}

async function getNotificationEvents(): Promise<Record<string, string>[]> {
  const entries = await redis.xrange(NOTIFICATIONS_STREAM, '-', '+');
  return entries.map(([, fields]) => toFieldMap(fields));
}

let eventBus: EventBus;

beforeEach(async () => {
  await cleanDb();
  eventBus = new EventBus(REDIS_URL);
});

describe('runReminderDispatch()', () => {
  it('sends notification for a reminder whose send_at is in the past', async () => {
    const data = await seedTestData();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await db
      .update(campaigns)
      .set({
        reminders: [
          {
            send_at: fiveMinutesAgo,
            channel: 'whatsapp',
            message_template: 'submit_reminder',
          },
        ],
      })
      .where(eq(campaigns.id, data.campaignId));

    await runReminderDispatch(eventBus, FORM_BASE_URL);

    await waitFor(async () => {
      const events = await getNotificationEvents();
      return events.length >= 2;
    });

    const events = await getNotificationEvents();
    expect(events.length).toBe(2);

    const payloads = events.map((e) => JSON.parse(e.payload) as Record<string, unknown>);
    expect(payloads[0].channel).toBe('whatsapp');
    expect(payloads[0].templateName).toBe('submit_reminder');
    expect(payloads[1].channel).toBe('whatsapp');
    expect(payloads[1].templateName).toBe('submit_reminder');
  });

  it('does not send if send_at is in the future', async () => {
    const data = await seedTestData();
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await db
      .update(campaigns)
      .set({
        reminders: [
          {
            send_at: oneHourFromNow,
            channel: 'email',
            message_template: 'submit_reminder',
          },
        ],
      })
      .where(eq(campaigns.id, data.campaignId));

    await runReminderDispatch(eventBus, FORM_BASE_URL);

    await new Promise((r) => setTimeout(r, 500));

    const events = await getNotificationEvents();
    expect(events.length).toBe(0);
  });

  it('skips already-submitted recipients when only_if is "not_submitted"', async () => {
    const data = await seedTestData();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await db
      .update(submissions)
      .set({ status: 'valid' })
      .where(eq(submissions.id, data.submission1Id));

    await db
      .update(campaigns)
      .set({
        reminders: [
          {
            send_at: fiveMinutesAgo,
            channel: 'email',
            message_template: 'submit_reminder',
            only_if: 'not_submitted',
          },
        ],
      })
      .where(eq(campaigns.id, data.campaignId));

    await runReminderDispatch(eventBus, FORM_BASE_URL);

    await waitFor(async () => {
      const events = await getNotificationEvents();
      return events.length >= 1;
    });

    const events = await getNotificationEvents();
    expect(events.length).toBe(1);

    const payload = JSON.parse(events[0].payload) as Record<string, unknown>;
    expect(payload.to).toBe('rec2@example.com');
  });

  it('sends to all recipients when only_if is not set', async () => {
    const data = await seedTestData();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await db
      .update(campaigns)
      .set({
        reminders: [
          {
            send_at: fiveMinutesAgo,
            channel: 'email',
            message_template: 'submit_reminder',
          },
        ],
      })
      .where(eq(campaigns.id, data.campaignId));

    await runReminderDispatch(eventBus, FORM_BASE_URL);

    await waitFor(async () => {
      const events = await getNotificationEvents();
      return events.length >= 2;
    });

    const events = await getNotificationEvents();
    expect(events.length).toBe(2);
  });

  it('does not send the same reminder twice (campaign_reminder_log deduplication)', async () => {
    const data = await seedTestData();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await db
      .update(campaigns)
      .set({
        reminders: [
          {
            send_at: fiveMinutesAgo,
            channel: 'email',
            message_template: 'submit_reminder',
          },
        ],
      })
      .where(eq(campaigns.id, data.campaignId));

    await runReminderDispatch(eventBus, FORM_BASE_URL);

    await waitFor(async () => {
      const events = await getNotificationEvents();
      return events.length >= 2;
    });

    const firstRunEvents = await getNotificationEvents();
    expect(firstRunEvents.length).toBe(2);

    await runReminderDispatch(eventBus, FORM_BASE_URL);

    await new Promise((r) => setTimeout(r, 500));

    const secondRunEvents = await getNotificationEvents();
    expect(secondRunEvents.length).toBe(2);
  });

  it('does not process closed campaigns', async () => {
    const data = await seedTestData();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await db
      .update(campaigns)
      .set({
        status: 'closed',
        reminders: [
          {
            send_at: fiveMinutesAgo,
            channel: 'email',
            message_template: 'submit_reminder',
          },
        ],
      })
      .where(eq(campaigns.id, data.campaignId));

    await runReminderDispatch(eventBus, FORM_BASE_URL);

    await new Promise((r) => setTimeout(r, 500));

    const events = await getNotificationEvents();
    expect(events.length).toBe(0);
  });
});

describe('runCampaignCloser()', () => {
  it('closes a campaign whose deadline has passed', async () => {
    const data = await seedTestData();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    await db
      .update(campaigns)
      .set({ deadline: oneHourAgo })
      .where(eq(campaigns.id, data.campaignId));

    await runCampaignCloser();

    const [campaign] = await db
      .select({ status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, data.campaignId));

    expect(campaign.status).toBe('closed');
  });

  it('does not close a campaign with a future deadline', async () => {
    const data = await seedTestData();

    await runCampaignCloser();

    const [campaign] = await db
      .select({ status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, data.campaignId));

    expect(campaign.status).toBe('active');
  });

  it('closing is idempotent — running twice does not error', async () => {
    const data = await seedTestData();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    await db
      .update(campaigns)
      .set({ deadline: oneHourAgo })
      .where(eq(campaigns.id, data.campaignId));

    await runCampaignCloser();
    await runCampaignCloser();

    const [campaign] = await db
      .select({ status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, data.campaignId));

    expect(campaign.status).toBe('closed');
  });
});
