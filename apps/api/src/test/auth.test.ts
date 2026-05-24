// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './setup';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

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

  it('returned token is a valid JWT containing tenantId', async () => {
    const apiKey = process.env['SEED_API_KEY'];
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: { api_key: apiKey },
    });
    const { token } = res.json<{ data: { token: string } }>().data;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.tenantId).toBeDefined();
  });
});
