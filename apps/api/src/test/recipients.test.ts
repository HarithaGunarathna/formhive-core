import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, getToken } from './setup';

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = await buildTestApp();
  token = await getToken(app);
});

afterAll(async () => {
  await app.close();
});

const authHeader = () => ({ Authorization: `Bearer ${token}` });

const threeRecipients = [
  { ref: 'FARM-001', channels: { email: 'farm1@test.com' } },
  { ref: 'FARM-002', channels: { email: 'farm2@test.com' } },
  { ref: 'FARM-003', channels: { sms: '+15550001' } },
];

describe('POST /v1/recipients', () => {
  it('bulk creates 3 recipients and returns created: 3, updated: 0', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      headers: authHeader(),
      payload: { recipients: threeRecipients },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.created).toBe(3);
    expect(data.updated).toBe(0);
  });

  it('upserts the same refs with different name and returns created: 0, updated: 3', async () => {
    const updated = threeRecipients.map((r) => ({ ...r, name: 'Updated Name' }));
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      headers: authHeader(),
      payload: { recipients: updated },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.created).toBe(0);
    expect(data.updated).toBe(3);
  });

  it('returns 400 for an empty recipients array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      headers: authHeader(),
      payload: { recipients: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when a recipient is missing ref', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      headers: authHeader(),
      payload: { recipients: [{ channels: { email: 'x@x.com' } }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when a recipient is missing channels', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      headers: authHeader(),
      payload: { recipients: [{ ref: 'NO-CHANNEL' }] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /v1/recipients', () => {
  it('returns 200 with an array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recipients',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('returns 3 recipients after creating 3', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      headers: authHeader(),
      payload: { recipients: threeRecipients },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/recipients',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(3);
  });

  it('returns 2 records with ?page=1&limit=2 when 3 exist', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/recipients',
      headers: authHeader(),
      payload: { recipients: threeRecipients },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/recipients?page=1&limit=2',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(2);
  });
});
