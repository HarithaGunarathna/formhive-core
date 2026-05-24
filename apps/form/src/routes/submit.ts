// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, submissions, campaigns, formSchemas } from '@formhive/db';
import { EventName, SUBMISSIONS_STREAM } from '@formhive/events';
import type { SubmissionReceivedPayload } from '@formhive/events';
import type { FormField } from '@formhive/types';
import { eventBus } from '../lib/eventbus';

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Normalise choices for select_one / select_multiple.
// The JSONB column may contain choices in several shapes depending on how the
// schema was created:
//   field.choices: Array<{ value: string; label: string }>  ← API schema standard
//   field.choices: string[]                                 ← plain-string shorthand
//   field.options: (either of the above)                   ← alternative key used by some tools
function getChoices(field: FormField): Array<{ value: string; label: string }> {
  const raw: unknown = field.choices ?? (field as unknown as Record<string, unknown>)['options'] ?? [];
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map((item) => {
    if (typeof item === 'string') return { value: item, label: item };
    if (typeof item === 'object' && item !== null) {
      const o = item as Record<string, unknown>;
      return { value: String(o['value'] ?? ''), label: String(o['label'] ?? o['value'] ?? '') };
    }
    return { value: String(item), label: String(item) };
  });
}

// Coerce URL-encoded form strings to the correct JS types before persisting.
// HTML forms serialise every input as a string; the validator expects numbers
// for decimal/integer fields and booleans for checkbox-style fields.
function coerceFormData(
  rawData: Record<string, string>,
  fields: FormField[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = rawData[field.id];
    if (raw === undefined || raw === '') continue;
    if (field.type === 'decimal' || field.type === 'integer') {
      const num = Number(raw);
      result[field.id] = isNaN(num) ? raw : num;
    } else if ((field.type as string) === 'boolean') {
      result[field.id] = raw === 'true' || raw === 'on';
    } else {
      result[field.id] = raw;
    }
  }
  return result;
}

function renderField(field: FormField): string {
  const req = field.required ? ' required' : '';
  const hint = field.hint ? `<p class="hint">${esc(field.hint)}</p>` : '';
  const label = `<label for="${esc(field.id)}">${esc(field.label)}${field.required ? ' <span class="req">*</span>' : ''}</label>`;

  let input: string;
  switch (field.type) {
    case 'integer':
      input = `<input type="number" id="${esc(field.id)}" name="${esc(field.id)}" step="1"${req}>`;
      break;
    case 'decimal':
      input = `<input type="number" id="${esc(field.id)}" name="${esc(field.id)}" step="any"${req}>`;
      break;
    case 'date':
      input = `<input type="date" id="${esc(field.id)}" name="${esc(field.id)}"${req}>`;
      break;
    case 'select_one': {
      const opts = getChoices(field)
        .map((c) => `<option value="${esc(c.value)}">${esc(c.label)}</option>`)
        .join('');
      input = `<select id="${esc(field.id)}" name="${esc(field.id)}"${req}><option value="">-- select --</option>${opts}</select>`;
      break;
    }
    case 'select_multiple': {
      const opts = getChoices(field)
        .map((c) => `<option value="${esc(c.value)}">${esc(c.label)}</option>`)
        .join('');
      input = `<select id="${esc(field.id)}" name="${esc(field.id)}" multiple${req}>${opts}</select>`;
      break;
    }
    case 'geopoint':
      input = `<input type="text" id="${esc(field.id)}" name="${esc(field.id)}" placeholder="latitude, longitude"${req}>`;
      break;
    case 'image':
    case 'audio':
      // File upload coming in a later release; collect as text for now
      input = `<input type="text" id="${esc(field.id)}" name="${esc(field.id)}" placeholder="(file upload not yet supported)"${req}>`;
      break;
    default: // 'text'
      input = `<input type="text" id="${esc(field.id)}" name="${esc(field.id)}"${req}>`;
  }

  return `<div class="field">${label}${hint}${input}</div>`;
}

const CSS = `
  body{font-family:system-ui,sans-serif;max-width:600px;margin:2rem auto;padding:0 1rem;color:#111}
  h1{font-size:1.5rem;margin-bottom:1.5rem}
  .field{margin-bottom:1.25rem}
  label{display:block;font-weight:600;margin-bottom:.25rem}
  .hint{color:#666;font-size:.875rem;margin:.2rem 0 .4rem}
  .req{color:#c00}
  input,select{width:100%;padding:.5rem .625rem;font-size:1rem;border:1px solid #ccc;border-radius:4px;box-sizing:border-box}
  select[multiple]{height:auto;min-height:6rem}
  button{background:#2563eb;color:#fff;border:none;padding:.625rem 1.75rem;font-size:1rem;border-radius:4px;cursor:pointer;margin-top:.5rem}
  button:hover{background:#1d4ed8}
  p.msg{font-size:1.1rem;margin-top:2rem}
`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export default async function submitRoutes(app: FastifyInstance): Promise<void> {
  // GET /f/:token — render the form
  app.get<{ Params: { token: string } }>('/:token', async (request, reply) => {
    const { token } = request.params;

    const [submission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.submissionToken, token));

    if (!submission) {
      return reply
        .status(404)
        .type('text/html')
        .send(page('Not found', '<p class="msg">This form link is not valid.</p>'));
    }

    if (submission.submittedAt !== null) {
      return reply
        .type('text/html')
        .send(page('Already submitted', '<p class="msg">You have already submitted this form. Thank you!</p>'));
    }

    // Fetch campaign + schema in a single join
    const [row] = await db
      .select({ campaignName: campaigns.name, fields: formSchemas.fields })
      .from(campaigns)
      .innerJoin(formSchemas, eq(formSchemas.id, campaigns.schemaId))
      .where(eq(campaigns.id, submission.campaignId));

    if (!row) {
      return reply
        .status(404)
        .type('text/html')
        .send(page('Not found', '<p class="msg">This form is no longer available.</p>'));
    }

    const fields = (row.fields as FormField[]) ?? [];
    const fieldsHtml = fields.map(renderField).join('');

    return reply
      .type('text/html')
      .send(
        page(
          row.campaignName,
          `<h1>${esc(row.campaignName)}</h1>
           <form method="POST" action="/f/${esc(token)}">
             ${fieldsHtml}
             <button type="submit">Submit</button>
           </form>`,
        ),
      );
  });

  // POST /f/:token — persist submission data and publish event
  app.post<{ Params: { token: string }; Body: Record<string, string> }>(
    '/:token',
    async (request, reply) => {
      const { token } = request.params;

      const [submission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.submissionToken, token));

      if (!submission) {
        return reply
          .status(404)
          .type('text/html')
          .send(page('Not found', '<p class="msg">This form link is not valid.</p>'));
      }

      if (submission.submittedAt !== null) {
        return reply
          .type('text/html')
          .send(page('Already submitted', '<p class="msg">You have already submitted this form. Thank you!</p>'));
      }

      // Load schema fields so we can coerce string form values to their correct types
      const [schemaRow] = await db
        .select({ fields: formSchemas.fields })
        .from(campaigns)
        .innerJoin(formSchemas, eq(formSchemas.id, campaigns.schemaId))
        .where(eq(campaigns.id, submission.campaignId));

      const fields = (schemaRow?.fields as FormField[]) ?? [];
      const coercedData = coerceFormData(request.body, fields);

      await db
        .update(submissions)
        .set({ data: coercedData, submittedAt: new Date() })
        .where(eq(submissions.submissionToken, token));

      // Publish submission.received so the validator can pick it up
      const payload: SubmissionReceivedPayload = {
        submissionId: submission.id,
        campaignId: submission.campaignId,
        recipientRef: submission.recipientRef,
        rawData: coercedData,
      };
      await eventBus.publish(SUBMISSIONS_STREAM, EventName.SUBMISSION_RECEIVED, payload);

      return reply
        .type('text/html')
        .send(page('Thank you', '<p class="msg">Your response has been recorded. Thank you!</p>'));
    },
  );
}
