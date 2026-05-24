// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { db, submissions } from '@formhive/db';
import { eq } from 'drizzle-orm';
import { buildTestApp, cleanDb, seedFormData, redis, PENDING_TOKEN, SUBMITTED_TOKEN } from './setup';

function toFieldMap(fields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) {
    map[fields[i]] = fields[i + 1];
  }
  return map;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanDb();
  await seedFormData();
});

describe('GET /f/:token', () => {
  it('returns 200 with HTML form containing field labels for a valid pending token', async () => {
    const res = await app.inject({ method: 'GET', url: `/f/${PENDING_TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('Your Name');
    expect(res.body).toContain('Your Age');
  });

  it('returns 200 with already-submitted message for a token that was already submitted', async () => {
    const res = await app.inject({ method: 'GET', url: `/f/${SUBMITTED_TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('already submitted');
  });

  it('renders <option> tags for each choice when schema has a select_one field', async () => {
    const res = await app.inject({ method: 'GET', url: `/f/${PENDING_TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<option value="paddy">');
    expect(res.body).toContain('<option value="maize">');
    expect(res.body).toContain('<option value="vegetables">');
    expect(res.body).toContain('-- select --');
  });

  it('returns 404 for a non-existent token', async () => {
    const res = await app.inject({ method: 'GET', url: '/f/this_token_does_not_exist00' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});

describe('POST /f/:token', () => {
  it('returns 200 with thank-you page on valid submission', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/f/${PENDING_TOKEN}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'field_name=John+Doe&field_age=30',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('Thank you');
  });

  it('persists submission data in the database', async () => {
    await app.inject({
      method: 'POST',
      url: `/f/${PENDING_TOKEN}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'field_name=John+Doe&field_age=30',
    });

    const [row] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.submissionToken, PENDING_TOKEN));

    expect(row).toBeDefined();
    expect(row.submittedAt).not.toBeNull();
    expect((row.data as Record<string, unknown>)['field_name']).toBe('John Doe');
  });

  it('publishes a submission.received event to the Redis stream', async () => {
    await app.inject({
      method: 'POST',
      url: `/f/${PENDING_TOKEN}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'field_name=John+Doe&field_age=30',
    });

    const result = await redis.xrange('formhive:submissions', '-', '+');
    expect(result.length).toBeGreaterThan(0);
    const [, fields] = result[result.length - 1];
    const fieldMap = toFieldMap(fields);
    expect(fieldMap['event']).toBe('submission.received');
    const payload = JSON.parse(fieldMap['payload']);
    expect(payload.recipientRef).toBe('REC-001');
  });

  it('coerces a decimal string to a number before persisting', async () => {
    await app.inject({
      method: 'POST',
      url: `/f/${PENDING_TOKEN}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'field_name=Test+Farm&farm_size=3.5',
    });

    const [row] = await db
      .select({ data: submissions.data })
      .from(submissions)
      .where(eq(submissions.submissionToken, PENDING_TOKEN));

    const data = row.data as Record<string, unknown>;
    expect(data['farm_size']).toBe(3.5);
    expect(typeof data['farm_size']).toBe('number');
  });

  it('returns already-submitted page when the same token is posted twice', async () => {
    const postOpts = {
      method: 'POST' as const,
      url: `/f/${PENDING_TOKEN}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'field_name=John+Doe&field_age=30',
    };

    await app.inject(postOpts);
    const res = await app.inject(postOpts);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('already submitted');
  });
});
