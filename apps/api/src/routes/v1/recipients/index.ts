import type { FastifyInstance } from 'fastify';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { recipients } from '@formhive/db';
import { requireJwt } from '../../../lib/auth';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

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

      const refs = inputs.map((r) => r.ref);

      // Pre-select existing refs to compute created vs updated counts after upsert.
      const existing = await db
        .select({ ref: recipients.ref })
        .from(recipients)
        .where(and(eq(recipients.tenantId, DEFAULT_TENANT_ID), inArray(recipients.ref, refs)));

      const existingRefs = new Set(existing.map((r) => r.ref));

      const rows = inputs.map((r) => ({
        tenantId: DEFAULT_TENANT_ID,
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
        .where(eq(recipients.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(recipients.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({ data: rows });
    },
  );
}
