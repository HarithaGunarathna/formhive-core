import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { db } from '../../../lib/db';
import { tenants } from '@formhive/db';

export default async function authRoutes(app: FastifyInstance): Promise<void> {
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

      // Phase 1: iterate all tenants (O(n), fine for single-tenant).
      // bcrypt hashes embed their salt so we can't do a WHERE lookup.
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
        { tenantId: matched.id, plan: matched.plan },
        { expiresIn: '24h' },
      );

      return reply.status(200).send({ data: { token } });
    },
  );
}
