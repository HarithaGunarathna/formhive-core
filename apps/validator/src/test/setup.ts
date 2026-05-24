// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

// NOTE: pnpm db:seed must be run before pnpm test.
// The seed script creates the tenant row that all FK references require.

import { beforeAll } from 'vitest';
import Redis from 'ioredis';
import { db, submissions, campaigns, formSchemas } from '@formhive/db';
import { SUBMISSIONS_STREAM } from '@formhive/events';

export const TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const VALIDATOR_GROUP = 'validator-group';

const REDIS_URL = process.env['REDIS_URL'];
if (!REDIS_URL) throw new Error('REDIS_URL environment variable is not set');
export const redis = new Redis(REDIS_URL);

export async function cleanDb(): Promise<void> {
  await db.delete(submissions);
  await db.delete(campaigns);
  await db.delete(formSchemas);
  // Delete stream entirely, then immediately recreate it with the consumer group.
  // This gives each test a fully clean slate while keeping the group alive so the
  // consume loop (started once in beforeAll) recovers after the transient NOGROUP
  // error and resumes blocking for the next message.
  await redis.del(SUBMISSIONS_STREAM);
  await redis.xgroup('CREATE', SUBMISSIONS_STREAM, VALIDATOR_GROUP, '0', 'MKSTREAM');
}

beforeAll(async () => {
  await cleanDb();
});
