// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import type { FastifyInstance } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { campaigns, submissions, formSchemas, recipients } from '@formhive/db';
import { requireJwt } from '../../../lib/auth';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active'],
  active: ['closed'],
  closed: [],
};

interface ReminderInput {
  send_at: string;
  channel: string;
  message_template: string;
  only_if?: string;
}

interface CreateCampaignBody {
  name: string;
  schema_id: string;
  deadline: string;
  reminders: ReminderInput[];
  webhook_url?: string;
  status?: string;
}

export default async function campaignsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateCampaignBody }>(
    '/',
    {
      preHandler: requireJwt,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'schema_id', 'deadline', 'reminders'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            schema_id: { type: 'string', format: 'uuid' },
            deadline: { type: 'string', format: 'date-time' },
            reminders: {
              type: 'array',
              items: {
                type: 'object',
                required: ['send_at', 'channel', 'message_template'],
                additionalProperties: false,
                properties: {
                  send_at: { type: 'string', format: 'date-time' },
                  channel: { type: 'string', enum: ['email', 'sms', 'whatsapp'] },
                  message_template: { type: 'string', minLength: 1 },
                  only_if: { type: 'string', enum: ['not_submitted'] },
                },
              },
            },
            webhook_url: { type: 'string', format: 'uri' },
            status: { type: 'string', enum: ['draft', 'active', 'closed'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, schema_id, deadline, reminders, webhook_url, status } = request.body;

      const [schema] = await db
        .select({ id: formSchemas.id })
        .from(formSchemas)
        .where(and(eq(formSchemas.id, schema_id), eq(formSchemas.tenantId, DEFAULT_TENANT_ID)));
      if (!schema) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Schema not found' } });
      }

      const [record] = await db
        .insert(campaigns)
        .values({
          tenantId: DEFAULT_TENANT_ID,
          name,
          schemaId: schema_id,
          deadline: new Date(deadline),
          reminders,
          webhookUrl: webhook_url ?? null,
          status: status ?? 'draft',
        })
        .returning();
      return reply.status(201).send({ data: record });
    },
  );

  app.get('/', { preHandler: requireJwt }, async (_request, reply) => {
    const rows = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.tenantId, DEFAULT_TENANT_ID))
      .orderBy(desc(campaigns.createdAt));
    return reply.send({ data: rows });
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

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, DEFAULT_TENANT_ID)));

      if (!campaign) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
      }

      const [summary] = await db
        .select({
          total: sql<number>`COUNT(*)::int`,
          submitted: sql<number>`COUNT(*) FILTER (WHERE ${submissions.status} IN ('valid', 'invalid'))::int`,
          pending: sql<number>`COUNT(*) FILTER (WHERE ${submissions.status} = 'pending')::int`,
          invalid: sql<number>`COUNT(*) FILTER (WHERE ${submissions.status} = 'invalid')::int`,
        })
        .from(submissions)
        .where(and(eq(submissions.campaignId, id), eq(submissions.tenantId, DEFAULT_TENANT_ID)));

      return reply.send({
        data: { ...campaign, summary: summary ?? { total: 0, submitted: 0, pending: 0, invalid: 0 } },
      });
    },
  );

  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/:id',
    {
      preHandler: requireJwt,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['draft', 'active', 'closed'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { status: newStatus } = request.body;

      const [campaign] = await db
        .select({ id: campaigns.id, status: campaigns.status })
        .from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, DEFAULT_TENANT_ID)));

      if (!campaign) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
      }

      const allowed = VALID_TRANSITIONS[campaign.status] ?? [];
      if (!allowed.includes(newStatus)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot transition from '${campaign.status}' to '${newStatus}'`,
            field: 'status',
          },
        });
      }

      const [updated] = await db
        .update(campaigns)
        .set({ status: newStatus })
        .where(eq(campaigns.id, id))
        .returning();

      // On activation, create one pending submission per tenant recipient
      if (newStatus === 'active') {
        const allRecipients = await db
          .select({ ref: recipients.ref })
          .from(recipients)
          .where(eq(recipients.tenantId, DEFAULT_TENANT_ID));

        if (allRecipients.length > 0) {
          await db.insert(submissions).values(
            allRecipients.map((r) => ({
              tenantId: DEFAULT_TENANT_ID,
              campaignId: id,
              recipientRef: r.ref,
              status: 'pending',
            })),
          );
        }
      }

      return reply.send({ data: updated });
    },
  );

  app.get<{ Params: { id: string }; Querystring: { page?: number; limit?: number } }>(
    '/:id/submissions',
    {
      preHandler: requireJwt,
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
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
      const { id } = request.params;
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 50;
      const offset = (page - 1) * limit;

      const [campaign] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, DEFAULT_TENANT_ID)));

      if (!campaign) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
      }

      const rows = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.campaignId, id), eq(submissions.tenantId, DEFAULT_TENANT_ID)))
        .orderBy(desc(submissions.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({ data: rows });
    },
  );
}
