// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import type { FormField } from '@formhive/types';

type JsonSchemaProperty =
  | { type: 'string'; format?: string; enum?: string[]; minLength?: number; maxLength?: number }
  | { type: 'number'; minimum?: number; maximum?: number }
  | { type: 'integer'; minimum?: number; maximum?: number }
  | { type: 'array'; items: { type: 'string'; enum?: string[] } };

export interface BuiltJsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: true;
}

export function buildJsonSchema(fields: FormField[]): BuiltJsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const field of fields) {
    if (field.required) required.push(field.id);

    const v = field.validation ?? {};

    switch (field.type) {
      case 'integer':
        properties[field.id] = {
          type: 'integer',
          ...(v.minimum !== undefined && { minimum: v.minimum }),
          ...(v.maximum !== undefined && { maximum: v.maximum }),
        };
        break;

      case 'decimal':
        properties[field.id] = {
          type: 'number',
          ...(v.minimum !== undefined && { minimum: v.minimum }),
          ...(v.maximum !== undefined && { maximum: v.maximum }),
        };
        break;

      case 'date':
        properties[field.id] = { type: 'string', format: 'date' };
        break;

      case 'select_one': {
        const enumValues = (field.choices ?? []).map((c) => c.value);
        properties[field.id] = {
          type: 'string',
          ...(enumValues.length > 0 && { enum: enumValues }),
        };
        break;
      }

      case 'select_multiple': {
        const enumValues = (field.choices ?? []).map((c) => c.value);
        properties[field.id] = {
          type: 'array',
          items: { type: 'string', ...(enumValues.length > 0 && { enum: enumValues }) },
        };
        break;
      }

      // text / geopoint / image / audio — accept any non-empty string
      default:
        properties[field.id] = {
          type: 'string',
          ...(v.minLength !== undefined && { minLength: v.minLength }),
          ...(v.maxLength !== undefined && { maxLength: v.maxLength }),
        };
    }
  }

  return { type: 'object', properties, required, additionalProperties: true };
}
