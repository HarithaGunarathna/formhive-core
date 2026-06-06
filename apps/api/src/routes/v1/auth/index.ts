// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, tenants, provisionTenant, authenticateTenant } from '@formhive/db';

const ACCOUNT_NAME_PATTERN = '^[a-z0-9_]{3,30}$';

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/auth/token — API key → JWT (developer / programmatic access)
  app.post<{ Body: { api_key: string } }>(
    '/token',
    {
      schema: {
        body: {
          type: 'object',
          required: ['api_key'],
          additionalProperties: false,
          properties: {
            api_key: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { api_key } = request.body;

      const allTenants = await db.select().from(tenants);
      let matched: (typeof allTenants)[0] | undefined;
      for (const tenant of allTenants) {
        if (await bcrypt.compare(api_key, tenant.apiKeyHash)) {
          matched = tenant;
          break;
        }
      }

      if (!matched) {
        return reply
          .status(401)
          .send({ error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } });
      }

      const token = app.jwt.sign(
        { tenantId: matched.id, plan: matched.plan, accountName: matched.accountName },
        { expiresIn: '24h' },
      );

      return reply.status(200).send({ data: { token } });
    },
  );

  // POST /v1/auth/register — self-serve registration (public)
  app.post<{ Body: { account_name: string; email: string; password: string } }>(
    '/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['account_name', 'email', 'password'],
          additionalProperties: false,
          properties: {
            account_name: {
              type: 'string',
              minLength: 3,
              maxLength: 30,
              pattern: ACCOUNT_NAME_PATTERN,
            },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8, maxLength: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const { account_name, email, password } = request.body;

      try {
        const result = await provisionTenant(account_name, email, password);
        return reply.status(201).send({
          data: {
            account_name: result.accountName,
            message: 'Account created. You can now sign in.',
          },
        });
      } catch (err) {
        if (!(err instanceof Error)) throw err;
        if (err.message === 'ACCOUNT_NAME_TAKEN') {
          return reply.status(409).send({
            error: { code: 'ACCOUNT_NAME_TAKEN', message: 'This account name is already taken' },
          });
        }
        if (err.message === 'EMAIL_TAKEN') {
          return reply.status(409).send({
            error: {
              code: 'EMAIL_TAKEN',
              message: 'An account with this email already exists',
            },
          });
        }
        if (err.message === 'INVALID_ACCOUNT_NAME') {
          return reply.status(400).send({
            error: {
              code: 'INVALID_ACCOUNT_NAME',
              message:
                'Account name must be 3-30 characters: lowercase letters, numbers and underscores only',
            },
          });
        }
        throw err;
      }
    },
  );

  // POST /v1/auth/login — account name + password → JWT (UI users)
  app.post<{ Body: { account_name: string; password: string } }>(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['account_name', 'password'],
          additionalProperties: false,
          properties: {
            account_name: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { account_name, password } = request.body;

      try {
        const result = await authenticateTenant(account_name, password);
        const token = app.jwt.sign(
          { tenantId: result.tenantId, plan: result.plan, accountName: result.accountName },
          { expiresIn: '24h' },
        );
        return reply.status(200).send({ data: { token } });
      } catch (err) {
        if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
          return reply.status(401).send({
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid account name or password',
            },
          });
        }
        throw err;
      }
    },
  );

  // GET /v1/auth/check-account-name — availability check for registration form
  app.get<{ Querystring: { name: string } }>(
    '/check-account-name',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { name } = request.query;

      if (!/^[a-z0-9_]{3,30}$/.test(name)) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_FORMAT',
            message:
              'Account name must be 3-30 characters: lowercase letters, numbers and underscores only',
          },
        });
      }

      const [existing] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.accountName, name))
        .limit(1);

      return reply.send({ data: { available: !existing } });
    },
  );
}
