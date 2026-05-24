// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, campaigns, recipients, submissions } from '@formhive/db';
import { EventName, CAMPAIGNS_STREAM } from '@formhive/events';
import type { CampaignActivatedPayload } from '@formhive/events';
import { eventBus } from '../lib/eventbus';

export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export async function activateCampaign(
  campaignId: string,
): Promise<typeof campaigns.$inferSelect> {
  // 1. Check campaign exists and is in draft status
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));

  if (!campaign) {
    throw new ServiceError('NOT_FOUND', 'Campaign not found', 404);
  }
  if (campaign.status !== 'draft') {
    throw new ServiceError(
      'INVALID_STATUS_TRANSITION',
      `Cannot activate campaign in '${campaign.status}' status`,
      400,
    );
  }

  // 2. Get all recipients for the tenant
  const allRecipients = await db
    .select({ ref: recipients.ref })
    .from(recipients)
    .where(eq(recipients.tenantId, campaign.tenantId));

  // 3. Bulk insert one pending submission per recipient, each with a unique token
  if (allRecipients.length > 0) {
    await db.insert(submissions).values(
      allRecipients.map((r) => ({
        tenantId: campaign.tenantId,
        campaignId,
        recipientRef: r.ref,
        submissionToken: nanoid(21),
        status: 'pending',
      })),
    );
  }

  // 4. Flip campaign status to active
  const [updated] = await db
    .update(campaigns)
    .set({ status: 'active' })
    .where(eq(campaigns.id, campaignId))
    .returning();

  // 5. Publish campaign.activated event
  const payload: CampaignActivatedPayload = {
    campaignId,
    tenantId: campaign.tenantId,
    submissionCount: allRecipients.length,
  };
  await eventBus.publish(CAMPAIGNS_STREAM, EventName.CAMPAIGN_ACTIVATED, payload);

  return updated;
}
