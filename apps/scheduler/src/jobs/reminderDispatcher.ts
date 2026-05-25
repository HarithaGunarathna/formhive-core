// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { db, campaigns, submissions, campaignReminderLog, recipients } from '@formhive/db';
import { EventBus, EventName, NOTIFICATIONS_STREAM } from '@formhive/events';
import { eq, lt, and } from 'drizzle-orm';
import type { NotificationSendPayload } from '@formhive/events';

interface Reminder {
  send_at: string;
  channel: 'sms' | 'whatsapp' | 'email';
  message_template: string;
  only_if?: 'not_submitted';
}

export async function runReminderDispatch(eventBus: EventBus, formBaseUrl: string): Promise<void> {
  try {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    const activeCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.status, 'active'));

    for (const campaign of activeCampaigns) {
      const reminders = (campaign.reminders as unknown as Reminder[]) || [];

      for (let reminderIndex = 0; reminderIndex < reminders.length; reminderIndex++) {
        const reminder = reminders[reminderIndex];
        const sendAt = new Date(reminder.send_at);

        if (sendAt > now || sendAt < tenMinutesAgo) {
          continue;
        }

        let recipientRefs: string[] = [];

        if (reminder.only_if === 'not_submitted') {
          const pendingSubs = await db
            .select({ recipientRef: submissions.recipientRef })
            .from(submissions)
            .where(
              and(eq(submissions.campaignId, campaign.id), eq(submissions.status, 'pending')),
            );
          recipientRefs = pendingSubs.map((s: { recipientRef: string }) => s.recipientRef);
        } else {
          const allRecipients = await db
            .select({ ref: recipients.ref })
            .from(recipients)
            .where(eq(recipients.tenantId, campaign.tenantId));
          recipientRefs = allRecipients.map((r: { ref: string }) => r.ref);
        }

        for (const recipientRef of recipientRefs) {
          const alreadySent = await db
            .select()
            .from(campaignReminderLog)
            .where(
              and(
                eq(campaignReminderLog.campaignId, campaign.id),
                eq(campaignReminderLog.reminderIndex, reminderIndex),
                eq(campaignReminderLog.recipientRef, recipientRef),
              ),
            );

          if (alreadySent.length > 0) {
            continue;
          }

          const [submission] = await db
            .select()
            .from(submissions)
            .where(
              and(
                eq(submissions.campaignId, campaign.id),
                eq(submissions.recipientRef, recipientRef),
              ),
            );

          if (!submission) {
            continue;
          }

          const [recipient] = await db
            .select()
            .from(recipients)
            .where(
              and(
                eq(recipients.tenantId, campaign.tenantId),
                eq(recipients.ref, recipientRef),
              ),
            );

          if (!recipient) {
            continue;
          }

          const channelAddresses = (recipient.channels as Record<string, string>) || {};
          const to = channelAddresses[reminder.channel];

          if (!to) {
            continue;
          }

          const payload: NotificationSendPayload = {
            to,
            channel: reminder.channel,
            templateName: reminder.message_template,
            variables: {
              name: recipient.name || recipientRef,
              campaign_name: campaign.name,
              submit_url: `${formBaseUrl}/f/${submission.submissionToken}`,
            },
          };

          await eventBus.publish(NOTIFICATIONS_STREAM, EventName.NOTIFICATION_SEND, payload);

          await db.insert(campaignReminderLog).values({
            campaignId: campaign.id,
            reminderIndex,
            recipientRef,
            sentAt: now,
          });

          console.log(
            `[scheduler] sent reminder ${reminderIndex} for campaign ${campaign.id} to ${recipientRef}`,
          );
        }
      }
    }
  } catch (err) {
    console.error('[scheduler] reminder dispatcher error:', err);
  }
}
