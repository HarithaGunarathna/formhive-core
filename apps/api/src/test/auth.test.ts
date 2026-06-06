// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { db, tenants, formSchemas, campaigns, submissions } from '@formhive/db';
import { eq } from 'drizzle-orm';
import { buildTestApp, getToken } from './setup';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

// ─── POST /v1/auth/token (API key → JWT) ─────────────────────────────────────

describe('POST /v1/auth/token', () => {
  it('returns 200 and a token for a valid api_key', async () => {
    const apiKey = process.env['SEED_API_KEY'];
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: { api_key: apiKey },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { token: string } }>();
    expect(typeof body.data.token).toBe('string');
    expect(body.data.token.length).toBeGreaterThan(0);
  });

  it('returns 401 for a wrong api_key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: { api_key: 'definitely-wrong-key' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_API_KEY');
  });

  it('returns 400 when api_key is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returned token is a valid JWT containing tenantId and accountName', async () => {
    const apiKey = process.env['SEED_API_KEY'];
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: { api_key: apiKey },
    });
    const { token } = res.json<{ data: { token: string } }>().data;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.tenantId).toBeDefined();
    expect(payload.accountName).toBeDefined();
  });
});

// ─── POST /v1/auth/register ──────────────────────────────────────────────────

describe('POST /v1/auth/register', () => {
  const suffix = Date.now();
  const TEST_ACCOUNT = `test_org_${suffix}`;
  const TEST_EMAIL = `test-${suffix}@example.com`;

  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.accountName, TEST_ACCOUNT));
  });

  it('valid account_name + email + password → 201 with account_name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { account_name: TEST_ACCOUNT, email: TEST_EMAIL, password: 'password123' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ data: { account_name: string; message: string } }>();
    expect(body.data.account_name).toBe(TEST_ACCOUNT);
    expect(body.data.message).toBeDefined();
  });

  it('account_name with spaces → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { account_name: 'agri ministry', email: 'x@x.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('account_name with hyphen → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { account_name: 'agri-ministry', email: 'x@x.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('account_name with uppercase → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { account_name: 'AgriMinistry', email: 'x@x.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('account_name too short (2 chars) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { account_name: 'ab', email: 'x@x.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('account_name too long (31 chars) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        account_name: 'a'.repeat(31),
        email: 'x@x.com',
        password: 'password123',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('duplicate account_name → 409 ACCOUNT_NAME_TAKEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        account_name: TEST_ACCOUNT,
        email: `other-${suffix}@example.com`,
        password: 'password123',
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ACCOUNT_NAME_TAKEN');
  });

  it('duplicate email → 409 EMAIL_TAKEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        account_name: `other_${suffix}`,
        email: TEST_EMAIL,
        password: 'password123',
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EMAIL_TAKEN');
  });

  it('password shorter than 8 chars → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { account_name: 'valid_name', email: 'pw@x.com', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('missing fields → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { account_name: 'valid_name' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /v1/auth/login ─────────────────────────────────────────────────────

describe('POST /v1/auth/login', () => {
  const suffix = Date.now();
  const LOGIN_ACCOUNT = `login_test_${suffix}`;
  const LOGIN_EMAIL = `login-${suffix}@example.com`;
  const LOGIN_PASS = 'testpassword99';

  beforeAll(async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        account_name: LOGIN_ACCOUNT,
        email: LOGIN_EMAIL,
        password: LOGIN_PASS,
      },
    });
  });

  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.accountName, LOGIN_ACCOUNT));
  });

  it('correct credentials → 200, returns token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { account_name: LOGIN_ACCOUNT, password: LOGIN_PASS },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBeDefined();
  });

  it('wrong password → 401 INVALID_CREDENTIALS', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { account_name: LOGIN_ACCOUNT, password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('non-existent account_name → 401 INVALID_CREDENTIALS', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { account_name: 'does_not_exist', password: 'anypassword' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('token payload contains tenantId and accountName', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { account_name: LOGIN_ACCOUNT, password: LOGIN_PASS },
    });
    const { token } = res.json<{ data: { token: string } }>().data;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.tenantId).toBeDefined();
    expect(payload.accountName).toBe(LOGIN_ACCOUNT);
  });

  it('returned token works for GET /v1/campaigns', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { account_name: LOGIN_ACCOUNT, password: LOGIN_PASS },
    });
    const { token } = loginRes.json<{ data: { token: string } }>().data;

    const campaignsRes = await app.inject({
      method: 'GET',
      url: '/v1/campaigns',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(campaignsRes.statusCode).toBe(200);
  });
});

// ─── GET /v1/auth/check-account-name ─────────────────────────────────────────

describe('GET /v1/auth/check-account-name', () => {
  it('available name → { available: true }', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/check-account-name?name=definitely_available_xyx',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.available).toBe(true);
  });

  it('taken name (seed account) → { available: false }', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/check-account-name?name=formhive_admin',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.available).toBe(false);
  });

  it('invalid format → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/check-account-name?name=Agri%20Ministry',
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Tenant isolation ─────────────────────────────────────────────────────────

describe('Tenant isolation', () => {
  const suffix = Date.now();
  const TENANT_A = `tenant_a_${suffix}`;
  const TENANT_B = `tenant_b_${suffix}`;
  const PASSWORD = 'isolationpass1';
  let tokenA: string;
  let tokenB: string;
  let campaignIdA: string;

  beforeAll(async () => {
    // Register two tenants
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { account_name: TENANT_A, email: `a-${suffix}@example.com`, password: PASSWORD },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { account_name: TENANT_B, email: `b-${suffix}@example.com`, password: PASSWORD },
    });

    const [resA, resB] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { account_name: TENANT_A, password: PASSWORD },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { account_name: TENANT_B, password: PASSWORD },
      }),
    ]);
    tokenA = resA.json<{ data: { token: string } }>().data.token;
    tokenB = resB.json<{ data: { token: string } }>().data.token;

    // Tenant A creates a schema and campaign
    const schemaRes = await app.inject({
      method: 'POST',
      url: '/v1/schemas',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'Isolation test schema',
        fields: [{ id: 'f1', type: 'text', label: 'Field 1' }],
      },
    });
    const schemaId = schemaRes.json<{ data: { id: string } }>().data.id;

    const campaignRes = await app.inject({
      method: 'POST',
      url: '/v1/campaigns',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'Tenant A campaign',
        schema_id: schemaId,
        deadline: '2026-12-31T23:59:00Z',
        reminders: [],
      },
    });
    campaignIdA = campaignRes.json<{ data: { id: string } }>().data.id;
  });

  afterAll(async () => {
    // Delete in FK order: submissions → campaigns → schemas → tenants
    const [tA] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.accountName, TENANT_A));
    const [tB] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.accountName, TENANT_B));
    for (const t of [tA, tB].filter(Boolean)) {
      await db.delete(submissions).where(eq(submissions.tenantId, t!.id));
      await db.delete(campaigns).where(eq(campaigns.tenantId, t!.id));
      await db.delete(formSchemas).where(eq(formSchemas.tenantId, t!.id));
    }
    await db.delete(tenants).where(eq(tenants.accountName, TENANT_A));
    await db.delete(tenants).where(eq(tenants.accountName, TENANT_B));
  });

  it('tenant B sees empty campaigns list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/campaigns',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });

  it('tenant B cannot GET campaign created by tenant A → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/campaigns/${campaignIdA}`,
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
