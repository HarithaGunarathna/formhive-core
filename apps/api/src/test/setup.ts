// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

// NOTE: pnpm db:seed must be run before pnpm test.
// The seed script must create a tenant with:
//   id   = '00000000-0000-0000-0000-000000000001'
//   api_key (plaintext) stored in SEED_API_KEY env var
//   api_key_hash = bcrypt hash of that key in tenants.api_key_hash
// Do NOT create the tenant here — that couples tests to tenant creation logic.

import { beforeAll } from 'vitest';
import { db, submissions, campaigns, recipients, formSchemas } from '@formhive/db';
import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';

export async function cleanDb(): Promise<void> {
  await db.delete(submissions);
  await db.delete(campaigns);
  await db.delete(recipients);
  await db.delete(formSchemas);
}

beforeAll(async () => {
  await cleanDb();
});

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

let cachedToken: string | null = null;

export async function getToken(app: FastifyInstance): Promise<string> {
  if (cachedToken !== null) return cachedToken;

  const apiKey = process.env['SEED_API_KEY'];
  if (!apiKey) {
    throw new Error('SEED_API_KEY env var is not set. Run pnpm db:seed first.');
  }

  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/token',
    payload: { api_key: apiKey },
  });

  if (res.statusCode !== 200) {
    throw new Error(
      `getToken: auth failed (${res.statusCode}). Is the seed tenant in the DB? Run pnpm db:seed.`,
    );
  }

  cachedToken = res.json<{ data: { token: string } }>().data.token;
  return cachedToken;
}
