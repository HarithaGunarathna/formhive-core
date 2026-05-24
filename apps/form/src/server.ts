// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import dotenv from 'dotenv';
import { join } from 'path';
import { buildApp } from './app';

// Load .env from the monorepo root before any plugin reads process.env.
// __dirname is apps/form/src (tsx dev) or apps/form/dist (compiled), so ../../../ reaches root.
dotenv.config({ path: join(__dirname, '../../..', '.env') });

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.ready();
    const address = await app.listen({ port: app.config.FORM_PORT, host: '0.0.0.0' });
    app.log.info(`Form service listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
