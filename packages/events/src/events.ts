// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import Redis from 'ioredis';

// ─── Event names ──────────────────────────────────────────────────────────────

export const EventName = {
  CAMPAIGN_ACTIVATED: 'campaign.activated',
  CAMPAIGN_REMINDER_DUE: 'campaign.reminder.due',
  SUBMISSION_RECEIVED: 'submission.received',
  SUBMISSION_VALIDATED: 'submission.validated',
  SUBMISSION_INVALID: 'submission.invalid',
  NOTIFICATION_SEND: 'notification.send',
} as const;

// Same identifier works as both a value (EventName.SUBMISSION_RECEIVED) and a type.
export type EventName = (typeof EventName)[keyof typeof EventName];

// ─── Stream names ─────────────────────────────────────────────────────────────

export const CAMPAIGNS_STREAM = 'formhive:campaigns';
export const SUBMISSIONS_STREAM = 'formhive:submissions';
export const NOTIFICATIONS_STREAM = 'formhive:notifications';

// ─── Payload types ────────────────────────────────────────────────────────────

export interface CampaignActivatedPayload {
  campaignId: string;
  tenantId: string;
  submissionCount: number;
}

export interface CampaignReminderDuePayload {
  campaignId: string;
  recipientRef: string;
  channel: 'sms' | 'whatsapp' | 'email';
  messageTemplate: string;
  submissionToken: string;
}

export interface SubmissionReceivedPayload {
  submissionId: string;
  campaignId: string;
  recipientRef: string;
  rawData: Record<string, unknown>;
}

export interface SubmissionValidatedPayload {
  submissionId: string;
  campaignId: string;
  recipientRef: string;
}

export interface SubmissionInvalidPayload {
  submissionId: string;
  campaignId: string;
  recipientRef: string;
  errors: string[];
}

export interface NotificationSendPayload {
  to: string;
  channel: 'sms' | 'whatsapp' | 'email';
  templateName: string;
  variables: Record<string, string>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type StreamEntry = [id: string, fields: string[]];
type StreamResult = [streamName: string, messages: StreamEntry[]];
type XReadGroupResult = StreamResult[];

function toFieldMap(fields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) {
    map[fields[i]] = fields[i + 1];
  }
  return map;
}

// ─── EventBus ─────────────────────────────────────────────────────────────────

/**
 * Thin wrapper around Redis Streams.
 *
 * Two Redis connections are created: one for XADD (publisher) and one for
 * the blocking XREADGROUP loop (subscriber). A single connection cannot be
 * used for both because a blocking read ties up the connection.
 */
export class EventBus {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private running = true;

  constructor(redisUrl: string) {
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
  }

  async publish(streamName: string, eventName: EventName, payload: unknown): Promise<void> {
    await this.publisher.xadd(
      streamName,
      '*',
      'event',
      eventName,
      'payload',
      JSON.stringify(payload),
    );
  }

  /**
   * Starts a blocking consume loop. Never resolves while running — call
   * without await in a fire-and-forget fashion, or run in a separate async
   * context.
   *
   * - Creates the consumer group if it does not already exist (MKSTREAM
   *   ensures the stream is also created if absent).
   * - Reads up to 10 messages at a time, blocking 2 s when the stream is
   *   empty.
   * - ACKs a message after the handler returns successfully.
   * - Does NOT ack on handler error so the message stays pending and will be
   *   redelivered.
   */
  async consume(
    streamName: string,
    groupName: string,
    consumerName: string,
    handler: (eventName: string, payload: unknown) => Promise<void>,
  ): Promise<void> {
    try {
      await this.subscriber.xgroup('CREATE', streamName, groupName, '0', 'MKSTREAM');
    } catch (err) {
      // BUSYGROUP means the group already exists — that's fine.
      if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) {
        throw err;
      }
    }

    while (this.running) {
      let streams: XReadGroupResult | null;

      try {
        streams = (await this.subscriber.xreadgroup(
          'GROUP',
          groupName,
          consumerName,
          'COUNT',
          10,
          'BLOCK',
          2000,
          'STREAMS',
          streamName,
          '>',
        )) as XReadGroupResult | null;
      } catch (err) {
        if (!this.running) break; // disconnected on purpose
        console.error('[EventBus] xreadgroup error:', err);
        continue;
      }

      if (!streams) continue; // BLOCK timeout — no messages, loop again

      for (const [, messages] of streams) {
        for (const [id, fields] of messages) {
          const fieldMap = toFieldMap(fields);
          const eventName = fieldMap['event'];
          const rawPayload = fieldMap['payload'];

          if (!eventName || rawPayload === undefined) {
            console.error(`[EventBus] Malformed message ${id} — acking to discard`);
            await this.subscriber.xack(streamName, groupName, id);
            continue;
          }

          let payload: unknown;
          try {
            payload = JSON.parse(rawPayload);
          } catch {
            console.error(`[EventBus] Could not parse payload for message ${id}`);
            await this.subscriber.xack(streamName, groupName, id);
            continue;
          }

          try {
            await handler(eventName, payload);
            await this.subscriber.xack(streamName, groupName, id);
          } catch (err) {
            // Leave the message un-acked so it stays in the PEL and will be
            // redelivered on the next XREADGROUP call.
            console.error(`[EventBus] Handler error for ${id} (${eventName}):`, err);
          }
        }
      }
    }
  }

  /** Signal the consume loop to exit after the current iteration. */
  stop(): void {
    this.running = false;
  }

  /** Stop the loop and close both Redis connections. */
  async disconnect(): Promise<void> {
    this.running = false;
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }
}
