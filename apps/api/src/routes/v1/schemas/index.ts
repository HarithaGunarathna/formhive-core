// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { formSchemas } from '@formhive/db';
import { requireJwt } from '../../../lib/auth';

// Phase 1: single-tenant constant. Replace with request.user.tenantId in Phase 2.
// Requires seed: INSERT INTO tenants (id, name, api_key_hash, plan)
// VALUES ('00000000-0000-0000-0000-000000000001', ...)
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const FIELD_TYPES = [
  'text',
  'decimal',
  'integer',
  'select_one',
  'select_multiple',
  'date',
  'geopoint',
  'image',
  'audio',
];

const fieldItemSchema = {
  type: 'object',
  required: ['id', 'type', 'label'],
  additionalProperties: true,
  properties: {
    id: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: FIELD_TYPES },
    label: { type: 'string', minLength: 1 },
    required: { type: 'boolean' },
    hint: { type: 'string' },
    choices: {
      type: 'array',
      items: {
        type: 'object',
        required: ['value', 'label'],
        properties: {
          value: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
  },
};

export default async function schemasRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { name: string; fields: unknown[] } }>(
    '/',
    {
      preHandler: requireJwt,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'fields'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            fields: { type: 'array', items: fieldItemSchema },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, fields } = request.body;
      const [record] = await db
        .insert(formSchemas)
        .values({ tenantId: DEFAULT_TENANT_ID, name, fields })
        .returning();
      return reply.status(201).send({ data: record });
    },
  );

  app.get('/', { preHandler: requireJwt }, async (_request, reply) => {
    const records = await db
      .select()
      .from(formSchemas)
      .where(eq(formSchemas.tenantId, DEFAULT_TENANT_ID))
      .orderBy(desc(formSchemas.createdAt));
    return reply.send({ data: records });
  });

  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: requireJwt,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const [record] = await db
        .select()
        .from(formSchemas)
        .where(and(eq(formSchemas.id, id), eq(formSchemas.tenantId, DEFAULT_TENANT_ID)));
      if (!record) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Schema not found' } });
      }
      return reply.send({ data: record });
    },
  );
}
