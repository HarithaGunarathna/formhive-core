// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

// NOTE: pnpm db:seed must be run before pnpm test.
// The seed script creates the tenant row that all FK references require.

import { beforeAll } from 'vitest';
import Redis from 'ioredis';
import { db, submissions, campaigns, formSchemas } from '@formhive/db';
import { SUBMISSIONS_STREAM } from '@formhive/events';
import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Fixed 21-character tokens used across tests
export const PENDING_TOKEN = 'test_token_pending_ok';
export const SUBMITTED_TOKEN = 'test_token_submitted1';

const REDIS_URL = process.env['REDIS_URL'];
if (!REDIS_URL) throw new Error('REDIS_URL environment variable is not set');
export const redis = new Redis(REDIS_URL);

export async function cleanDb(): Promise<void> {
  await db.delete(submissions);
  await db.delete(campaigns);
  await db.delete(formSchemas);
  // Wipe the submissions stream so Redis assertions are isolated per test
  await redis.del(SUBMISSIONS_STREAM);
}

beforeAll(async () => {
  await cleanDb();
});

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

export async function seedFormData(): Promise<void> {
  const [schema] = await db
    .insert(formSchemas)
    .values({
      tenantId: TENANT_ID,
      name: 'Test Form',
      fields: [
        { id: 'field_name', type: 'text', label: 'Your Name' },
        { id: 'field_age', type: 'integer', label: 'Your Age' },
        { id: 'farm_size', type: 'decimal', label: 'Farm Size (ha)' },
        {
          id: 'crop_type',
          type: 'select_one',
          label: 'Crop Type',
          choices: [
            { value: 'paddy', label: 'Paddy' },
            { value: 'maize', label: 'Maize' },
            { value: 'vegetables', label: 'Vegetables' },
          ],
        },
      ],
    })
    .returning({ id: formSchemas.id });

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

  // One pending (untouched) submission and one already-submitted submission
  await db.insert(submissions).values([
    {
      tenantId: TENANT_ID,
      campaignId: campaign.id,
      recipientRef: 'REC-001',
      submissionToken: PENDING_TOKEN,
      status: 'pending',
    },
    {
      tenantId: TENANT_ID,
      campaignId: campaign.id,
      recipientRef: 'REC-002',
      submissionToken: SUBMITTED_TOKEN,
      status: 'pending',
      data: { field_name: 'Jane Doe' },
      submittedAt: new Date(),
    },
  ]);
}
