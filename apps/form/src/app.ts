// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import healthRoutes from './routes/health';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  // TODO: register @fastify/env
  // TODO: register tokenised form route (GET /f/:token)
  // TODO: register submission POST route (POST /f/:token/submit)

  await app.register(healthRoutes, { prefix: '/health' });

  return app;
}
