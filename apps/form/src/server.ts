// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { buildApp } from './app';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
