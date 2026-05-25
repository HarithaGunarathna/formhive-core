// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { db, campaigns } from '@formhive/db';
import { eq, lt, and } from 'drizzle-orm';

export async function runCampaignCloser(): Promise<void> {
  try {
    const now = new Date();

    const closedCount = await db
      .update(campaigns)
      .set({ status: 'closed' })
      .where(and(eq(campaigns.status, 'active'), lt(campaigns.deadline, now)))
      .returning({ id: campaigns.id });

    if (closedCount.length > 0) {
      console.log(`[scheduler] closed ${closedCount.length} campaign(s)`);
    }
  } catch (err) {
    console.error('[scheduler] campaign closer error:', err);
  }
}
