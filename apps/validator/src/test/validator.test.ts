// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, submissions, campaigns, formSchemas } from '@formhive/db';
import { EventBus, EventName, SUBMISSIONS_STREAM } from '@formhive/events';
import type { SubmissionReceivedPayload } from '@formhive/events';
import type { XlsFormFieldType } from '@formhive/types';
import { createHandler } from '../handler';
import { cleanDb, redis, TENANT_ID, VALIDATOR_GROUP } from './setup';
import { waitFor } from './helpers/waitFor';

const REDIS_URL = process.env['REDIS_URL'] as string;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toFieldMap(fields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) map[fields[i]] = fields[i + 1];
  return map;
}

async function findStreamEvent(eventName: string): Promise<Record<string, string> | null> {
  const messages = await redis.xrange(SUBMISSIONS_STREAM, '-', '+');
  for (const [, fields] of messages) {
    const m = toFieldMap(fields);
    if (m['event'] === eventName) return m;
  }
  return null;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let eventBus: EventBus;
let campaignId: string;

beforeAll(() => {
  eventBus = new EventBus(REDIS_URL);
  // Do NOT await — consume() runs forever. Store the promise and ignore it.
  void eventBus.consume(SUBMISSIONS_STREAM, VALIDATOR_GROUP, 'validator-1', createHandler(eventBus));
});

afterAll(async () => {
  eventBus.stop();
  await eventBus.disconnect();
});

beforeEach(async () => {
  await cleanDb();

  const [schema] = await db
    .insert(formSchemas)
    .values({
      tenantId: TENANT_ID,
      name: 'Test Form',
      fields: [
        { id: 'farm_name', type: 'text', label: 'Farm Name', required: true },
        {
          id: 'farm_size',
          type: 'decimal',
          label: 'Farm Size (ha)',
          validation: { minimum: 0, maximum: 1000 },
        },
      ],
    })
    .returning({ id: formSchemas.id });

  const [campaign] = await db
    .insert(campaigns)
    .values({
      tenantId: TENANT_ID,
      name: 'Test Campaign',
      schemaId: schema.id,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      reminders: [],
      status: 'active',
    })
    .returning({ id: campaigns.id });

  campaignId = campaign.id;
});

async function insertSubmission(data: Record<string, unknown>): Promise<string> {
  const [sub] = await db
    .insert(submissions)
    .values({
      tenantId: TENANT_ID,
      campaignId,
      recipientRef: 'REC-001',
      status: 'pending',
      data,
      submittedAt: new Date(),
    })
    .returning({ id: submissions.id });
  return sub.id;
}

async function publishReceived(submissionId: string): Promise<void> {
  const payload: SubmissionReceivedPayload = {
    submissionId,
    campaignId,
    recipientRef: 'REC-001',
    rawData: {},
  };
  await eventBus.publish(SUBMISSIONS_STREAM, EventName.SUBMISSION_RECEIVED, payload);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VALID SUBMISSION', () => {
  it('sets status to valid and emits submission.validated', async () => {
    const subId = await insertSubmission({ farm_name: 'Green Acres', farm_size: 5.5 });
    await publishReceived(subId);

    await waitFor(async () => {
      const [row] = await db
        .select({ status: submissions.status })
        .from(submissions)
        .where(eq(submissions.id, subId));
      return row?.status === 'valid';
    });

    const [row] = await db
      .select({ status: submissions.status, submittedAt: submissions.submittedAt })
      .from(submissions)
      .where(eq(submissions.id, subId));
    expect(row.status).toBe('valid');
    expect(row.submittedAt).not.toBeNull();

    await waitFor(async () => (await findStreamEvent(EventName.SUBMISSION_VALIDATED)) !== null);

    const evt = await findStreamEvent(EventName.SUBMISSION_VALIDATED);
    expect(evt).not.toBeNull();
    const p = JSON.parse(evt!['payload']) as { submissionId: string };
    expect(p.submissionId).toBe(subId);
  });
});

describe('INVALID SUBMISSION', () => {
  it('sets status to invalid and emits submission.invalid when farm_size exceeds max', async () => {
    const subId = await insertSubmission({ farm_name: 'Big Farm', farm_size: 5000 });
    await publishReceived(subId);

    await waitFor(async () => {
      const [row] = await db
        .select({ status: submissions.status })
        .from(submissions)
        .where(eq(submissions.id, subId));
      return row?.status === 'invalid';
    });

    const [row] = await db
      .select({ status: submissions.status, validationErrors: submissions.validationErrors })
      .from(submissions)
      .where(eq(submissions.id, subId));
    expect(row.status).toBe('invalid');
    expect((row.validationErrors as unknown[]).length).toBeGreaterThan(0);

    await waitFor(async () => (await findStreamEvent(EventName.SUBMISSION_INVALID)) !== null);

    const evt = await findStreamEvent(EventName.SUBMISSION_INVALID);
    expect(evt).not.toBeNull();
    const p = JSON.parse(evt!['payload']) as { submissionId: string; errors: string[] };
    expect(p.submissionId).toBe(subId);
    expect(p.errors.length).toBeGreaterThan(0);
  });
});

describe('MISSING REQUIRED FIELD', () => {
  it('sets status to invalid when a required field is absent', async () => {
    const subId = await insertSubmission({ farm_size: 5.5 }); // missing farm_name
    await publishReceived(subId);

    await waitFor(async () => {
      const [row] = await db
        .select({ status: submissions.status })
        .from(submissions)
        .where(eq(submissions.id, subId));
      return row?.status === 'invalid';
    });

    const [row] = await db
      .select({ validationErrors: submissions.validationErrors })
      .from(submissions)
      .where(eq(submissions.id, subId));

    const errors = row.validationErrors as Array<{
      keyword: string;
      params: { missingProperty?: string };
    }>;
    const hasMissingFarmName = errors.some(
      (e) => e.keyword === 'required' && e.params?.missingProperty === 'farm_name',
    );
    expect(hasMissingFarmName).toBe(true);
  });
});

describe('UNKNOWN FIELD TYPE', () => {
  it('processes a submission with an unrecognised field type without crashing', async () => {
    // Seed a fresh schema with an unknown field type (bypassing TypeScript with a cast)
    const [schema] = await db
      .insert(formSchemas)
      .values({
        tenantId: TENANT_ID,
        name: 'Future Form',
        fields: [{ id: 'notes', type: 'custom_future_type' as XlsFormFieldType, label: 'Notes' }],
      })
      .returning({ id: formSchemas.id });

    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: TENANT_ID,
        name: 'Future Campaign',
        schemaId: schema.id,
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reminders: [],
        status: 'active',
      })
      .returning({ id: campaigns.id });

    const [sub] = await db
      .insert(submissions)
      .values({
        tenantId: TENANT_ID,
        campaignId: campaign.id,
        recipientRef: 'REC-002',
        status: 'pending',
        data: {},
        submittedAt: new Date(),
      })
      .returning({ id: submissions.id });

    const payload: SubmissionReceivedPayload = {
      submissionId: sub.id,
      campaignId: campaign.id,
      recipientRef: 'REC-002',
      rawData: {},
    };
    await eventBus.publish(SUBMISSIONS_STREAM, EventName.SUBMISSION_RECEIVED, payload);

    await waitFor(async () => {
      const [row] = await db
        .select({ status: submissions.status })
        .from(submissions)
        .where(eq(submissions.id, sub.id));
      return row?.status === 'valid';
    });

    const [row] = await db
      .select({ status: submissions.status })
      .from(submissions)
      .where(eq(submissions.id, sub.id));
    expect(row.status).toBe('valid');
  });
});

describe('MALFORMED PAYLOAD', () => {
  it('acks and discards a message with no payload key, then processes the next valid event', async () => {
    // Publish a raw Redis message missing the 'payload' field — EventBus will ack and discard it
    await redis.xadd(SUBMISSIONS_STREAM, '*', 'event', 'submission.received');

    // Confirm the malformed message is in the stream
    expect(await redis.xlen(SUBMISSIONS_STREAM)).toBeGreaterThan(0);

    // Wait until PEL is empty — the message was delivered to the consumer and acked
    await waitFor(async () => {
      const pending = await redis.xpending(SUBMISSIONS_STREAM, VALIDATOR_GROUP, '-', '+', 10);
      return (pending as unknown[]).length === 0;
    });

    // Validator is still running: publish a valid event and verify it's processed
    const subId = await insertSubmission({ farm_name: 'Resilient Farm', farm_size: 3.0 });
    await publishReceived(subId);

    await waitFor(async () => {
      const [row] = await db
        .select({ status: submissions.status })
        .from(submissions)
        .where(eq(submissions.id, subId));
      return row?.status === 'valid';
    });

    const [row] = await db
      .select({ status: submissions.status })
      .from(submissions)
      .where(eq(submissions.id, subId));
    expect(row.status).toBe('valid');
  });
});
