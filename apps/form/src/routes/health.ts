// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import type { FastifyInstance } from 'fastify';

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    return { data: { status: 'ok' }, error: null };
  });
}
