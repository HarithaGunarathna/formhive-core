// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  plan: text('plan').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const formSchemas = pgTable('form_schemas', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  fields: jsonb('fields').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const recipients = pgTable(
  'recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ref: text('ref').notNull(),
    name: text('name'),
    channels: jsonb('channels').notNull().default({}),
    prefill: jsonb('prefill').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantRefUnique: unique('recipients_tenant_id_ref_unique').on(table.tenantId, table.ref),
  }),
);

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text('name').notNull(),
  schemaId: uuid('schema_id')
    .notNull()
    .references(() => formSchemas.id),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  reminders: jsonb('reminders').notNull().default([]),
  status: text('status').notNull().default('draft'),
  webhookUrl: text('webhook_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id),
  recipientRef: text('recipient_ref').notNull(),
  submissionToken: text('submission_token').unique(),
  data: jsonb('data').default({}),
  status: text('status').notNull().default('pending'),
  validationErrors: jsonb('validation_errors').default([]),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
