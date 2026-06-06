// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import type { FastifyInstance } from 'fastify';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { recipients } from '@formhive/db';
import { requireJwt } from '../../../lib/auth';

interface RecipientInput {
  ref: string;
  name?: string;
  channels: Record<string, unknown>;
  prefill?: Record<string, unknown>;
}

export default async function recipientsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { recipients: RecipientInput[] } }>(
    '/',
    {
      preHandler: requireJwt,
      schema: {
        body: {
          type: 'object',
          required: ['recipients'],
          additionalProperties: false,
          properties: {
            recipients: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['ref', 'channels'],
                additionalProperties: false,
                properties: {
                  ref: { type: 'string', minLength: 1 },
                  name: { type: 'string' },
                  channels: { type: 'object' },
                  prefill: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { recipients: inputs } = request.body;
      const tenantId = request.user.tenantId;

      const refs = inputs.map((r) => r.ref);

      const existing = await db
        .select({ ref: recipients.ref })
        .from(recipients)
        .where(and(eq(recipients.tenantId, tenantId), inArray(recipients.ref, refs)));

      const existingRefs = new Set(existing.map((r) => r.ref));

      const rows = inputs.map((r) => ({
        tenantId,
        ref: r.ref,
        name: r.name ?? null,
        channels: r.channels,
        prefill: r.prefill ?? {},
      }));

      await db
        .insert(recipients)
        .values(rows)
        .onConflictDoUpdate({
          target: [recipients.tenantId, recipients.ref],
          set: {
            name: sql`excluded.name`,
            channels: sql`excluded.channels`,
            prefill: sql`excluded.prefill`,
          },
        });

      return reply.status(200).send({
        data: {
          created: inputs.length - existingRefs.size,
          updated: existingRefs.size,
        },
      });
    },
  );

  app.get<{ Querystring: { page?: number; limit?: number } }>(
    '/',
    {
      preHandler: requireJwt,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 50;
      const offset = (page - 1) * limit;

      const rows = await db
        .select()
        .from(recipients)
        .where(eq(recipients.tenantId, request.user.tenantId))
        .orderBy(desc(recipients.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({ data: rows });
    },
  );
}
