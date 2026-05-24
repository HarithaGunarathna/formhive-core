// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

/**
 * Creates (or re-keys) the single seed tenant used by integration tests.
 *
 * Run:  pnpm db:seed
 *
 * What it does:
 *   1. Loads .env from the repo root.
 *   2. Inserts a tenant row with the fixed SEED_TENANT_ID, or updates its
 *      api_key_hash if the row already exists.
 *   3. Writes the new plaintext API key back into SEED_API_KEY in .env so
 *      `pnpm --filter api test` picks it up automatically.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import bcrypt from 'bcryptjs';

const ENV_PATH = resolve(__dirname, '../../../../.env');
const SEED_TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function main(): Promise<void> {
  // Must run before any module that reads DATABASE_URL at load time.
  config({ path: ENV_PATH });

  // Dynamic imports so DATABASE_URL is already set when @formhive/db initialises.
  const { db, tenants } = await import('@formhive/db');
  const { eq } = await import('drizzle-orm');

  const apiKey = randomBytes(32).toString('hex');
  const apiKeyHash = await bcrypt.hash(apiKey, 10);

  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, SEED_TENANT_ID));

  if (existing) {
    await db
      .update(tenants)
      .set({ apiKeyHash })
      .where(eq(tenants.id, SEED_TENANT_ID));
    console.log('✓ Seed tenant updated with new API key');
  } else {
    await db.insert(tenants).values({
      id: SEED_TENANT_ID,
      name: 'Default Tenant',
      apiKeyHash,
      plan: 'free',
    });
    console.log('✓ Seed tenant created');
  }

  // Write SEED_API_KEY into .env so tests can read it via process.env.
  let envContent = readFileSync(ENV_PATH, 'utf8');
  if (/^SEED_API_KEY=/m.test(envContent)) {
    envContent = envContent.replace(/^SEED_API_KEY=.*/m, `SEED_API_KEY=${apiKey}`);
  } else {
    envContent = `${envContent.trimEnd()}\nSEED_API_KEY=${apiKey}\n`;
  }
  writeFileSync(ENV_PATH, envContent, 'utf8');

  console.log('✓ SEED_API_KEY written to .env');
  console.log(`  Tenant ID : ${SEED_TENANT_ID}`);
  console.log(`  API Key   : ${apiKey}`);

  // postgres-js holds an open connection pool — exit explicitly.
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
