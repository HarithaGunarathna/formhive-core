// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyEnv from '@fastify/env';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
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
    R2_ENDPOINT: { type: 'string', default: 'http://localhost:9000' },
    R2_ACCESS_KEY_ID: { type: 'string', default: '' },
    R2_SECRET_ACCESS_KEY: { type: 'string', default: '' },
    R2_BUCKET: { type: 'string', default: 'formhive' },
    R2_PUBLIC_URL: { type: 'string', default: 'http://localhost:9000/formhive' },
  },
} as const;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB default

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug' },
    ignoreTrailingSlash: true,
  });

  await app.register(fastifyEnv, { schema: envSchema });

  // Parse application/x-www-form-urlencoded bodies from HTML form POSTs
  await app.register(formbody);

  // Parse multipart/form-data for the file upload endpoint
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES } });

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(submitRoutes, { prefix: '/f' });

  return app;
}
