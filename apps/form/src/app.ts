// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyEnv from '@fastify/env';
import formbody from '@fastify/formbody';
import healthRoutes from './routes/health';
import submitRoutes from './routes/submit';

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      FORM_PORT: number;
      NODE_ENV: string;
    };
  }
}

const envSchema = {
  type: 'object',
  required: ['NODE_ENV'],
  properties: {
    FORM_PORT: { type: 'number', default: 3001 },
    NODE_ENV: { type: 'string', default: 'development' },
  },
} as const;

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug' },
    ignoreTrailingSlash: true,
  });

  await app.register(fastifyEnv, { schema: envSchema });

  // Parse application/x-www-form-urlencoded bodies from HTML form POSTs
  await app.register(formbody);

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(submitRoutes, { prefix: '/f' });

  return app;
}
