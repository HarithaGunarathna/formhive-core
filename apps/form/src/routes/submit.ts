// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, submissions, campaigns, formSchemas } from '@formhive/db';
import { EventName, SUBMISSIONS_STREAM } from '@formhive/events';
import type { SubmissionReceivedPayload } from '@formhive/events';
import type { FormField } from '@formhive/types';
import { eventBus } from '../lib/eventbus';
import {
  uploadFile,
  buildObjectKey,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_AUDIO_TYPES,
} from '../lib/storage';

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

/** Returns true for field types that use the file upload flow. */
function isFileField(type: string): boolean {
  return type === 'image' || type === 'audio' || type === 'file';
}

function renderField(field: FormField, token: string): string {
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
      // File picker with device camera capture; hidden input carries the uploaded URL
      input = `
        <input type="file" class="file-picker" id="${esc(field.id)}_file"
          accept="image/jpeg,image/png,image/webp,image/gif" capture="environment"
          data-field-id="${esc(field.id)}" data-token="${esc(token)}">
        <input type="hidden" name="${esc(field.id)}" id="${esc(field.id)}_url">
        <div id="${esc(field.id)}_status" class="upload-status"></div>`;
      break;
    case 'audio':
      input = `
        <input type="file" class="file-picker" id="${esc(field.id)}_file"
          accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm"
          data-field-id="${esc(field.id)}" data-token="${esc(token)}">
        <input type="hidden" name="${esc(field.id)}" id="${esc(field.id)}_url">
        <div id="${esc(field.id)}_status" class="upload-status"></div>`;
      break;
    default: // 'text', 'file', and any future types
      if ((field.type as string) === 'file') {
        input = `
          <input type="file" class="file-picker" id="${esc(field.id)}_file"
            data-field-id="${esc(field.id)}" data-token="${esc(token)}">
          <input type="hidden" name="${esc(field.id)}" id="${esc(field.id)}_url">
          <div id="${esc(field.id)}_status" class="upload-status"></div>`;
      } else {
        input = `<input type="text" id="${esc(field.id)}" name="${esc(field.id)}"${req}>`;
      }
  }

  return `<div class="field">${label}${hint}${input}</div>`;
}

// Inline JS for the file upload flow — vanilla JS, no external deps
const UPLOAD_JS = `
<script>
(function() {
  document.querySelectorAll('.file-picker').forEach(function(picker) {
    picker.addEventListener('change', function() {
      var fieldId = this.dataset.fieldId;
      var token   = this.dataset.token;
      var file    = this.files[0];
      if (!file) return;
      var status  = document.getElementById(fieldId + '_status');
      var hidden  = document.getElementById(fieldId + '_url');
      status.innerHTML = '<span class="uploading">Uploading…</span>';
      hidden.value = '';
      var fd = new FormData();
      fd.append('fieldId', fieldId);
      fd.append('file', file);
      fetch('/f/' + token + '/upload', { method: 'POST', body: fd })
        .then(function(r) { return r.json(); })
        .then(function(body) {
          if (body && body.data && body.data.url) {
            hidden.value = body.data.url;
            var isImg = file.type.startsWith('image/');
            status.innerHTML = isImg
              ? '<span class="ok">✓ Uploaded</span><br><img src="' + URL.createObjectURL(file) + '" class="preview">'
              : '<span class="ok">✓ ' + file.name + ' uploaded</span>';
          } else {
            status.innerHTML = '<span class="err">Upload failed — please try again.</span>';
          }
        })
        .catch(function() {
          status.innerHTML = '<span class="err">Upload failed — please try again.</span>';
        });
    });
  });

  // Validate required file fields before submit
  var form = document.getElementById('main-form');
  if (form) {
    form.addEventListener('submit', function(e) {
      var missing = [];
      document.querySelectorAll('.file-picker').forEach(function(picker) {
        if (!picker.dataset.required) return;
        var hidden = document.getElementById(picker.dataset.fieldId + '_url');
        if (!hidden || !hidden.value) {
          var lbl = picker.closest('.field').querySelector('label');
          missing.push(lbl ? lbl.textContent.replace(/\\s*\\*\\s*$/, '').trim() : picker.dataset.fieldId);
        }
      });
      if (missing.length > 0) {
        e.preventDefault();
        alert('Please upload a file for: ' + missing.join(', '));
      }
    });
  }
})();
</script>`;

const CSS = `
  body{font-family:system-ui,sans-serif;max-width:600px;margin:2rem auto;padding:0 1rem;color:#111}
  h1{font-size:1.5rem;margin-bottom:1.5rem}
  .field{margin-bottom:1.25rem}
  label{display:block;font-weight:600;margin-bottom:.25rem}
  .hint{color:#666;font-size:.875rem;margin:.2rem 0 .4rem}
  .req{color:#c00}
  input,select{width:100%;padding:.5rem .625rem;font-size:1rem;border:1px solid #ccc;border-radius:4px;box-sizing:border-box}
  input[type=file]{border:none;padding:0}
  select[multiple]{height:auto;min-height:6rem}
  button{background:#2563eb;color:#fff;border:none;padding:.625rem 1.75rem;font-size:1rem;border-radius:4px;cursor:pointer;margin-top:.5rem}
  button:hover{background:#1d4ed8}
  p.msg{font-size:1.1rem;margin-top:2rem}
  .upload-status{margin-top:.375rem;font-size:.875rem}
  .upload-status .ok{color:#16a34a}
  .upload-status .err{color:#c00}
  .upload-status .uploading{color:#666}
  .upload-status .preview{display:block;max-width:200px;margin-top:.5rem;border-radius:4px}
`;

function page(title: string, body: string, includeUploadJs = false): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}${includeUploadJs ? UPLOAD_JS : ''}</body></html>`;
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
    const hasFileFields = fields.some((f) => isFileField(f.type));
    const fieldsHtml = fields.map((f) => renderField(f, token)).join('');

    return reply
      .type('text/html')
      .send(
        page(
          row.campaignName,
          `<h1>${esc(row.campaignName)}</h1>
           <form id="main-form" method="POST" action="/f/${esc(token)}">
             ${fieldsHtml}
             <button type="submit">Submit</button>
           </form>`,
          hasFileFields,
        ),
      );
  });

  // POST /f/:token/upload — multipart file upload, returns { fieldId, url }
  app.post<{ Params: { token: string } }>(
    '/:token/upload',
    async (request, reply) => {
      const { token } = request.params;

      const [submission] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.submissionToken, token));

      if (!submission || submission.submittedAt !== null) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Submission not found or already submitted' } });
      }

      // Load schema to validate field type
      const [schemaRow] = await db
        .select({ fields: formSchemas.fields, tenantId: campaigns.tenantId })
        .from(campaigns)
        .innerJoin(formSchemas, eq(formSchemas.id, campaigns.schemaId))
        .where(eq(campaigns.id, submission.campaignId));

      if (!schemaRow) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
      }

      const fields = (schemaRow.fields as FormField[]) ?? [];

      // Parse multipart
      const parts = request.parts();
      let fieldId = '';
      let fileBuffer: Buffer | null = null;
      let mimeType = '';
      let fileSize = 0;

      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'fieldId') {
          fieldId = part.value as string;
        } else if (part.type === 'file' && part.fieldname === 'file') {
          mimeType = part.mimetype;
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk as Buffer);
            fileSize += (chunk as Buffer).length;
          }
          fileBuffer = Buffer.concat(chunks);
        }
      }

      if (!fieldId || !fileBuffer) {
        return reply.status(400).send({ error: { code: 'MISSING_FIELDS', message: 'fieldId and file are required' } });
      }

      // Find the field definition
      const fieldDef = fields.find((f) => f.id === fieldId);
      if (!fieldDef || !isFileField(fieldDef.type)) {
        return reply.status(400).send({ error: { code: 'INVALID_FIELD', message: 'Field not found or not a file field' } });
      }

      // Validate MIME type by field type
      if (fieldDef.type === 'image' && !ALLOWED_IMAGE_TYPES.has(mimeType)) {
        return reply.status(400).send({ error: { code: 'INVALID_TYPE', message: 'Only JPEG, PNG, WebP and GIF images are allowed' } });
      }
      if (fieldDef.type === 'audio' && !ALLOWED_AUDIO_TYPES.has(mimeType)) {
        return reply.status(400).send({ error: { code: 'INVALID_TYPE', message: 'Only MP3, M4A, OGG, WAV and WebM audio files are allowed' } });
      }

      // Validate file size against field-level max_mb constraint
      const maxMb = (fieldDef.validation as Record<string, unknown> | undefined)?.['max_mb'];
      const maxBytes = typeof maxMb === 'number' ? maxMb * 1024 * 1024 : 10 * 1024 * 1024;
      if (fileSize > maxBytes) {
        const limit = typeof maxMb === 'number' ? maxMb : 10;
        return reply.status(400).send({ error: { code: 'FILE_TOO_LARGE', message: `File exceeds the ${limit} MB limit` } });
      }

      const key = buildObjectKey(
        schemaRow.tenantId,
        submission.campaignId,
        submission.id,
        fieldId,
        mimeType,
      );

      try {
        const url = await uploadFile(key, fileBuffer, mimeType);
        return reply.send({ data: { fieldId, url } });
      } catch (err) {
        request.log.error(err, 'storage upload failed');
        return reply.status(500).send({ error: { code: 'UPLOAD_FAILED', message: 'File upload failed' } });
      }
    },
  );

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
