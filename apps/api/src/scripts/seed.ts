// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

/**
 * Creates the default admin tenant for local development and integration tests.
 *
 * Run:  pnpm db:seed
 *
 * What it does:
 *   1. Loads .env from the repo root.
 *   2. Calls provisionTenant('formhive_admin', 'admin@formhive.com', 'changeme123').
 *      If the account name already exists, skips creation.
 *   3. Generates a fresh internal API key and writes it to SEED_API_KEY in .env
 *      (integration tests use this key via POST /v1/auth/token).
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

const ENV_PATH = resolve(__dirname, '../../../../.env');
const SEED_ACCOUNT = 'formhive_admin';
const SEED_EMAIL = 'admin@formhive.com';
const SEED_PASSWORD = 'changeme123';

async function main(): Promise<void> {
  config({ path: ENV_PATH });

  const { db, tenants, provisionTenant } = await import('@formhive/db');
  const { eq } = await import('drizzle-orm');
  const bcrypt = await import('bcryptjs');
  const { randomBytes } = await import('crypto');

  // Create or skip the seed tenant
  const result = await provisionTenant(SEED_ACCOUNT, SEED_EMAIL, SEED_PASSWORD).catch(
    (err: Error) => {
      if (err.message === 'ACCOUNT_NAME_TAKEN') {
        console.log('[seed] Admin tenant already exists, skipping creation');
        return null;
      }
      throw err;
    },
  );

  if (result) {
    console.log('─────────────────────────────────────');
    console.log('[seed] Admin tenant created');
    console.log(`  Account:  ${SEED_ACCOUNT}`);
    console.log(`  Email:    ${SEED_EMAIL}`);
    console.log(`  Password: ${SEED_PASSWORD}`);
    console.log('  ⚠ Change this password after first login');
    console.log('─────────────────────────────────────');
  }

  // Generate a fresh API key for the seed tenant and write it to .env.
  // Integration tests authenticate via POST /v1/auth/token with this key.
  const apiKey = `fh_live_${randomBytes(16).toString('hex')}`;
  const hash = await bcrypt.hash(apiKey, 10);

  const [seedTenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.accountName, SEED_ACCOUNT));

  if (!seedTenant) {
    console.error('[seed] Could not find seed tenant after provisioning — aborting');
    process.exit(1);
  }

  await db.update(tenants).set({ apiKeyHash: hash }).where(eq(tenants.accountName, SEED_ACCOUNT));

  let envContent = readFileSync(ENV_PATH, 'utf8');
  if (/^SEED_API_KEY=/m.test(envContent)) {
    envContent = envContent.replace(/^SEED_API_KEY=.*/m, `SEED_API_KEY=${apiKey}`);
  } else {
    envContent = `${envContent.trimEnd()}\nSEED_API_KEY=${apiKey}\n`;
  }
  writeFileSync(ENV_PATH, envContent, 'utf8');

  console.log('[seed] SEED_API_KEY written to .env');
  console.log('[seed] Done.');

  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
