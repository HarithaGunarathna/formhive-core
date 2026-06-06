// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import { db } from './client';
import { tenants } from './schema';

const ACCOUNT_NAME_RE = /^[a-z0-9_]{3,30}$/;

export interface ProvisionResult {
  tenantId: string;
  accountName: string;
}

export async function provisionTenant(
  accountName: string,
  email: string,
  password: string,
): Promise<ProvisionResult> {
  if (!ACCOUNT_NAME_RE.test(accountName)) {
    throw new Error('INVALID_ACCOUNT_NAME');
  }

  const existing = await db
    .select({ id: tenants.id, accountName: tenants.accountName })
    .from(tenants)
    .where(or(eq(tenants.accountName, accountName), eq(tenants.email, email)))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].accountName === accountName) {
      throw new Error('ACCOUNT_NAME_TAKEN');
    }
    throw new Error('EMAIL_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const plainKey = `fh_live_${randomBytes(16).toString('hex')}`;
  const apiKeyHash = await bcrypt.hash(plainKey, 10);

  const [tenant] = await db
    .insert(tenants)
    .values({
      accountName,
      email,
      passwordHash,
      apiKeyHash,
      plan: 'free',
    })
    .returning();

  return {
    tenantId: tenant.id,
    accountName: tenant.accountName,
  };
}

export async function authenticateTenant(
  accountName: string,
  password: string,
): Promise<{ tenantId: string; plan: string; accountName: string }> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.accountName, accountName))
    .limit(1);

  if (!tenant) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(password, tenant.passwordHash);
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  return {
    tenantId: tenant.id,
    plan: tenant.plan,
    accountName: tenant.accountName,
  };
}
