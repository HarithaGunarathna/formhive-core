import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyEnv from '@fastify/env';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import healthRoutes from './routes/health/index';
import authRoutes from './routes/v1/auth/index';
import schemasRoutes from './routes/v1/schemas/index';
import recipientsRoutes from './routes/v1/recipients/index';
import campaignsRoutes from './routes/v1/campaigns/index';

// ─── Config type ──────────────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      PORT: number;
      JWT_SECRET: string;
      NODE_ENV: string;
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { tenantId: string; plan: string };
    user: { tenantId: string; plan: string };
  }
}

const envSchema = {
  type: 'object',
  required: ['PORT', 'JWT_SECRET', 'NODE_ENV'],
  properties: {
    PORT: { type: 'number', default: 3000 },
    JWT_SECRET: { type: 'string', minLength: 1 },
    NODE_ENV: { type: 'string', default: 'development' },
  },
} as const;

// ─── App factory ──────────────────────────────────────────────────────────────

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug' },
    ignoreTrailingSlash: true,
  });

  // Validates required env vars; throws on app.ready() if any are missing.
  await app.register(fastifyEnv, { schema: envSchema });

  // Use process.env directly here — @fastify/env hasn't run yet (it runs at
  // ready-time), but dotenv was loaded in server.ts before buildApp() was called.
  await app.register(cors, {
    origin: process.env['NODE_ENV'] !== 'production',
  });

  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? '',
  });

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(schemasRoutes, { prefix: '/v1/schemas' });
  await app.register(recipientsRoutes, { prefix: '/v1/recipients' });
  await app.register(campaignsRoutes, { prefix: '/v1/campaigns' });

  return app;
}
