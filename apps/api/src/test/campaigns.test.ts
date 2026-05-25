// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, getToken, cleanDb } from './setup';

let app: FastifyInstance;
let token: string;
let schemaId: string;

const RECIPIENT_REFS = ['REC-001', 'REC-002', 'REC-003'];

const authHeader = () => ({ Authorization: `Bearer ${token}` });

const validDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

beforeAll(async () => {
  app = await buildTestApp();
  token = await getToken(app);
});

afterAll(async () => {
  await app.close();
});

// Each test gets a fully clean slate: no campaigns, recipients, or schemas bleed between tests.
// This is necessary because activation is a one-way state transition and tests that activate
// a campaign would prevent re-use of the same campaign in later tests.
beforeEach(async () => {
  await cleanDb();

  const schemaRes = await app.inject({
    method: 'POST',
    url: '/v1/schemas',
    headers: authHeader(),
    payload: {
      name: 'Test Schema',
      fields: [{ id: 'q1', type: 'text', label: 'Name' }],
    },
  });
  schemaId = schemaRes.json().data.id as string;

  await app.inject({
    method: 'POST',
    url: '/v1/recipients',
    headers: authHeader(),
    payload: {
      recipients: RECIPIENT_REFS.map((ref) => ({
        ref,
        channels: { email: `${ref.toLowerCase()}@test.com` },
      })),
    },
  });
});

async function createDraftCampaign(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/campaigns',
    headers: authHeader(),
    payload: {
      name: 'Test Campaign',
      schema_id: schemaId,
      deadline: validDeadline,
      reminders: [],
    },
  });
  return res.json().data.id as string;
}

describe('POST /v1/campaigns', () => {
  it('creates a campaign with status draft', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/campaigns',
      headers: authHeader(),
      payload: {
        name: 'Maize Survey 2026',
        schema_id: schemaId,
        deadline: validDeadline,
        reminders: [],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe('draft');
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/campaigns',
      headers: authHeader(),
      payload: { schema_id: schemaId, deadline: validDeadline, reminders: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when schema_id is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/campaigns',
      headers: authHeader(),
      payload: { name: 'X', deadline: validDeadline, reminders: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for a valid UUID schema_id that does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/campaigns',
      headers: authHeader(),
      payload: {
        name: 'Ghost',
        schema_id: '00000000-0000-0000-0000-000000000099',
        deadline: validDeadline,
        reminders: [],
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for an invalid deadline (not ISO string)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/campaigns',
      headers: authHeader(),
      payload: { name: 'X', schema_id: schemaId, deadline: 'next-tuesday', reminders: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /v1/campaigns', () => {
  it('returns 200 with an array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/campaigns',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });
});

describe('GET /v1/campaigns/:id', () => {
  it('returns the campaign with a summary object', async () => {
    const id = await createDraftCampaign();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.id).toBe(id);
    expect(data.summary).toMatchObject({
      total: expect.any(Number),
      submitted: expect.any(Number),
      pending: expect.any(Number),
      invalid: expect.any(Number),
    });
  });

  it('summary.pending equals recipient count after activation', async () => {
    const id = await createDraftCampaign();
    await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
    });
    expect(res.json().data.summary.pending).toBe(RECIPIENT_REFS.length);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/campaigns/00000000-0000-0000-0000-000000000099',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /v1/campaigns/:id', () => {
  it('transitions draft → active and returns status active', async () => {
    const id = await createDraftCampaign();
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('active');
  });

  it('transitions active → closed', async () => {
    const id = await createDraftCampaign();
    await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'closed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('closed');
  });

  it('rejects closed → active with 400 INVALID_STATUS_TRANSITION', async () => {
    const id = await createDraftCampaign();
    await app.inject({ method: 'PATCH', url: `/v1/campaigns/${id}`, headers: authHeader(), payload: { status: 'active' } });
    await app.inject({ method: 'PATCH', url: `/v1/campaigns/${id}`, headers: authHeader(), payload: { status: 'closed' } });

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('rejects draft → closed with 400 INVALID_STATUS_TRANSITION', async () => {
    const id = await createDraftCampaign();
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'closed' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('creates one submissions row per recipient when activating', async () => {
    const id = await createDraftCampaign();
    await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/campaigns/${id}/submissions`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(RECIPIENT_REFS.length);
  });

  describe('submission tokens', () => {
    let campaignId: string;

    beforeEach(async () => {
      campaignId = await createDraftCampaign();
      await app.inject({
        method: 'PATCH',
        url: `/v1/campaigns/${campaignId}`,
        headers: authHeader(),
        payload: { status: 'active' },
      });
    });

    it('creates one submission token per recipient', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/campaigns/${campaignId}/submissions`,
        headers: authHeader(),
      });
      const { data } = res.json();
      expect(data).toHaveLength(3);
      data.forEach((s: { submissionToken: unknown; status: string }) => {
        expect(s.submissionToken).toBeDefined();
        expect(s.submissionToken).toHaveLength(21);
        expect(s.status).toBe('pending');
      });
    });

    it('all submission tokens are unique', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/campaigns/${campaignId}/submissions`,
        headers: authHeader(),
      });
      const tokens = res.json().data.map((s: { submissionToken: string }) => s.submissionToken);
      expect(new Set(tokens).size).toBe(tokens.length);
    });
  });

  it('activating twice does not create duplicate submissions', async () => {
    const id = await createDraftCampaign();
    await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'closed' },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('updates reminders on an active campaign', async () => {
    const id = await createDraftCampaign();
    await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });

    const newReminders = [
      {
        send_at: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        channel: 'email',
        message_template: 'reminder',
      },
      {
        send_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        channel: 'whatsapp',
        message_template: 'final_warning',
      },
    ];

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { reminders: newReminders },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.reminders).toEqual(newReminders);
  });

  it('rejects reminders update on a closed campaign with 400', async () => {
    const id = await createDraftCampaign();
    await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'closed' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: {
        reminders: [
          {
            send_at: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
            channel: 'email',
            message_template: 'reminder',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_UPDATE');
  });
});

describe('GET /v1/campaigns/:id/submissions', () => {
  it('returns 200 with an array', async () => {
    const id = await createDraftCampaign();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/campaigns/${id}/submissions`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('all submissions have status pending after activation', async () => {
    const id = await createDraftCampaign();
    await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/campaigns/${id}/submissions`,
      headers: authHeader(),
    });
    const rows = res.json().data as { status: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
  });

  it('pagination: ?page=1&limit=1 returns 1 record when 3 exist', async () => {
    const id = await createDraftCampaign();
    await app.inject({
      method: 'PATCH',
      url: `/v1/campaigns/${id}`,
      headers: authHeader(),
      payload: { status: 'active' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/campaigns/${id}/submissions?page=1&limit=1`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});
