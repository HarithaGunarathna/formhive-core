// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import dotenv from 'dotenv';
import { join } from 'path';
import { buildApp } from './app';

// Load .env from the monorepo root before any plugin reads process.env.
// __dirname is apps/api/src (tsx dev) or apps/api/dist (compiled), so ../../../ reaches root.
dotenv.config({ path: join(__dirname, '../../..', '.env') });

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    // app.ready() initialises all plugins (including @fastify/env validation).
    // Must be called before accessing app.config.
    await app.ready();
    const address = await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
    app.log.info(`Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
