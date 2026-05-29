// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import Redis from 'ioredis';
import { db, submissions, campaigns, formSchemas, recipients, campaignReminderLog } from '@formhive/db';
import { NOTIFICATIONS_STREAM } from '@formhive/events';
import { nanoid } from 'nanoid';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const REDIS_URL = process.env['REDIS_URL'];
if (!REDIS_URL) throw new Error('REDIS_URL environment variable is not set');

export const redis = new Redis(REDIS_URL);

export async function cleanDb(): Promise<void> {
  try {
    await db.delete(campaignReminderLog);
  } catch {
    // Table may not exist if migrations haven't run yet
  }
  await db.delete(submissions);
  await db.delete(campaigns);
  await db.delete(formSchemas);
  await db.delete(recipients);
  await redis.del(NOTIFICATIONS_STREAM);
}

export async function seedTestData(): Promise<{
  schemaId: string;
  campaignId: string;
  recipient1Ref: string;
  recipient2Ref: string;
  submission1Id: string;
  submission2Id: string;
}> {
  const [schema] = await db
    .insert(formSchemas)
    .values({
      tenantId: TENANT_ID,
      name: 'Test Schema',
      fields: [{ id: 'q1', type: 'text', label: 'Question 1' }],
    })
    .returning({ id: formSchemas.id });

  const recipient1Ref = 'REC-001';
  const recipient2Ref = 'REC-002';

  await db.insert(recipients).values([
    {
      tenantId: TENANT_ID,
      ref: recipient1Ref,
      name: 'Recipient One',
      channels: { email: 'rec1@example.com', whatsapp: '+1234567890' },
    },
    {
      tenantId: TENANT_ID,
      ref: recipient2Ref,
      name: 'Recipient Two',
      channels: { email: 'rec2@example.com', whatsapp: '+0987654321' },
    },
  ]);

  const [campaign] = await db
    .insert(campaigns)
    .values({
      tenantId: TENANT_ID,
      name: 'Test Campaign',
      schemaId: schema.id,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      reminders: [],
      status: 'active',
    })
    .returning({ id: campaigns.id });

  const [sub1] = await db
    .insert(submissions)
    .values({
      tenantId: TENANT_ID,
      campaignId: campaign.id,
      recipientRef: recipient1Ref,
      submissionToken: nanoid(21),
      status: 'pending',
    })
    .returning({ id: submissions.id });

  const [sub2] = await db
    .insert(submissions)
    .values({
      tenantId: TENANT_ID,
      campaignId: campaign.id,
      recipientRef: recipient2Ref,
      submissionToken: nanoid(21),
      status: 'pending',
    })
    .returning({ id: submissions.id });

  return {
    schemaId: schema.id,
    campaignId: campaign.id,
    recipient1Ref,
    recipient2Ref,
    submission1Id: sub1.id,
    submission2Id: sub2.id,
  };
}
