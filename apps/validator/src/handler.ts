// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { eq } from 'drizzle-orm';
import { db, submissions, campaigns, formSchemas } from '@formhive/db';
import { EventBus, EventName, SUBMISSIONS_STREAM } from '@formhive/events';
import type {
  SubmissionReceivedPayload,
  SubmissionValidatedPayload,
  SubmissionInvalidPayload,
} from '@formhive/events';
import type { FormField } from '@formhive/types';
import { buildJsonSchema } from './lib/schema-builder';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

async function handleSubmissionReceived(
  payload: SubmissionReceivedPayload,
  publishBus: EventBus,
): Promise<void> {
  const { submissionId } = payload;

  const [row] = await db
    .select({
      id: submissions.id,
      campaignId: submissions.campaignId,
      recipientRef: submissions.recipientRef,
      data: submissions.data,
      fields: formSchemas.fields,
    })
    .from(submissions)
    .innerJoin(campaigns, eq(campaigns.id, submissions.campaignId))
    .innerJoin(formSchemas, eq(formSchemas.id, campaigns.schemaId))
    .where(eq(submissions.id, submissionId));

  if (!row) {
    console.error(`[validator] submission ${submissionId} not found — skipping`);
    return;
  }

  const fields = (row.fields as FormField[]) ?? [];
  const schema = buildJsonSchema(fields);
  const data = (row.data ?? {}) as Record<string, unknown>;

  const valid = ajv.validate(schema, data);

  if (valid) {
    await db.update(submissions).set({ status: 'valid' }).where(eq(submissions.id, submissionId));

    const validatedPayload: SubmissionValidatedPayload = {
      submissionId,
      campaignId: row.campaignId,
      recipientRef: row.recipientRef,
    };
    await publishBus.publish(SUBMISSIONS_STREAM, EventName.SUBMISSION_VALIDATED, validatedPayload);

    console.log(`[validator] ${submissionId} → VALID`);
  } else {
    const errors = ajv.errors ?? [];
    const errorMessages = errors
      .map((e) => `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim());

    await db
      .update(submissions)
      .set({ status: 'invalid', validationErrors: errors })
      .where(eq(submissions.id, submissionId));

    const invalidPayload: SubmissionInvalidPayload = {
      submissionId,
      campaignId: row.campaignId,
      recipientRef: row.recipientRef,
      errors: errorMessages,
    };
    await publishBus.publish(SUBMISSIONS_STREAM, EventName.SUBMISSION_INVALID, invalidPayload);

    console.log(`[validator] ${submissionId} → INVALID:`, errorMessages.join(' | '));
  }
}

export function createHandler(
  publishBus: EventBus,
): (eventName: string, rawPayload: unknown) => Promise<void> {
  return async (eventName, rawPayload) => {
    if (eventName !== EventName.SUBMISSION_RECEIVED) return;
    await handleSubmissionReceived(rawPayload as SubmissionReceivedPayload, publishBus);
  };
}
