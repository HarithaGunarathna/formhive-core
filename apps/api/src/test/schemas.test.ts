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

const validFields = [
  { id: 'hectares', type: 'decimal', label: 'Farm size (ha)' },
  { id: 'crop', type: 'select_one', label: 'Primary crop', choices: [{ value: 'maize', label: 'Maize' }] },
];

describe('GET /v1/schemas (no auth)', () => {
  it('returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/schemas' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /v1/schemas', () => {
  it('creates a schema and returns 201 with id, name, version: 1, fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schemas',
      headers: authHeader(),
      payload: { name: 'Farm Survey', fields: validFields },
    });
    expect(res.statusCode).toBe(201);
    const { data } = res.json();
    expect(data.id).toBeDefined();
    expect(data.name).toBe('Farm Survey');
    expect(data.version).toBe(1);
    expect(Array.isArray(data.fields)).toBe(true);
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schemas',
      headers: authHeader(),
      payload: { fields: validFields },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when a field is missing id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schemas',
      headers: authHeader(),
      payload: { name: 'Bad', fields: [{ type: 'text', label: 'No ID' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when a field is missing type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schemas',
      headers: authHeader(),
      payload: { name: 'Bad', fields: [{ id: 'q1', label: 'No type' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when a field is missing label', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schemas',
      headers: authHeader(),
      payload: { name: 'Bad', fields: [{ id: 'q1', type: 'text' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when a field has an unsupported type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/schemas',
      headers: authHeader(),
      payload: { name: 'Bad', fields: [{ id: 'q1', type: 'freeform', label: 'Q1' }] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /v1/schemas', () => {
  it('returns 200 with an array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/schemas',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('returns both schemas after creating two', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/schemas',
      headers: authHeader(),
      payload: { name: 'Schema Alpha', fields: validFields },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/schemas',
      headers: authHeader(),
      payload: { name: 'Schema Beta', fields: validFields },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/schemas',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /v1/schemas/:id', () => {
  it('returns 200 with matching id for an existing schema', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/schemas',
      headers: authHeader(),
      payload: { name: 'Lookup Test', fields: validFields },
    });
    const schemaId = created.json().data.id as string;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/schemas/${schemaId}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(schemaId);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/schemas/00000000-0000-0000-0000-000000000099',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for a malformed uuid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/schemas/not-a-uuid',
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(400);
  });
});
