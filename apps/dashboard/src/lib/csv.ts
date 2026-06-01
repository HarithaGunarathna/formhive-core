// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import type { RecipientInput } from '@/api/types';

export interface ParsedCsv {
  recipients: RecipientInput[];
  errors: string[];
}

const HEADER_ALIASES: Record<string, 'ref' | 'name' | 'phone' | 'email'> = {
  ref: 'ref',
  id: 'ref',
  identifier: 'ref',
  name: 'name',
  phone: 'phone',
  whatsapp: 'phone',
  mobile: 'phone',
  email: 'email',
};

function splitLine(line: string): string[] {
  return line.split(',').map((c) => c.trim());
}

export function parseRecipientsCsv(text: string): ParsedCsv {
  const errors: string[] = [];
  const recipients: RecipientInput[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { recipients, errors };
  }

  const headerRaw = splitLine(lines[0]).map((h) => h.toLowerCase());
  const colMap: Array<'ref' | 'name' | 'phone' | 'email' | null> = headerRaw.map(
    (h) => HEADER_ALIASES[h] ?? null,
  );

  if (!colMap.includes('ref')) {
    errors.push('CSV must include a "ref" column.');
    return { recipients, errors };
  }
  if (!colMap.includes('phone') && !colMap.includes('email')) {
    errors.push('CSV must include at least one of "phone"/"whatsapp" or "email".');
    return { recipients, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const row: Partial<Record<'ref' | 'name' | 'phone' | 'email', string>> = {};
    for (let c = 0; c < colMap.length; c++) {
      const key = colMap[c];
      if (key && cols[c]) row[key] = cols[c];
    }

    if (!row.ref) {
      errors.push(`Row ${i + 1}: missing ref — skipped.`);
      continue;
    }
    if (!row.phone && !row.email) {
      errors.push(`Row ${i + 1} (${row.ref}): no phone or email — skipped.`);
      continue;
    }

    const channels: Record<string, string> = {};
    if (row.phone) channels.whatsapp = row.phone;
    if (row.email) channels.email = row.email;

    recipients.push({
      ref: row.ref,
      ...(row.name ? { name: row.name } : {}),
      channels,
    });
  }

  return { recipients, errors };
}
