// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import type {
  CampaignStatus,
  FormField,
  SubmissionStatus,
} from '@formhive/types';

export type { CampaignStatus, FormField, SubmissionStatus };

export interface Schema {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  fields: FormField[];
  createdAt: string;
}

export type ReminderChannel = 'email' | 'sms' | 'whatsapp';

export interface Reminder {
  send_at: string;
  channel: ReminderChannel;
  message_template: string;
  only_if?: 'not_submitted';
}

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  schemaId: string;
  deadline: string;
  reminders: Reminder[];
  status: CampaignStatus;
  webhookUrl: string | null;
  createdAt: string;
}

export interface CampaignSummary {
  total: number;
  submitted: number;
  pending: number;
  invalid: number;
}

export interface CampaignWithSummary extends Campaign {
  summary: CampaignSummary;
}

export interface Submission {
  id: string;
  tenantId: string;
  campaignId: string;
  recipientRef: string;
  submissionToken: string | null;
  data: Record<string, unknown>;
  status: SubmissionStatus;
  validationErrors: Array<{ field?: string; message: string }> | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface Recipient {
  id: string;
  tenantId: string;
  ref: string;
  name: string | null;
  channels: Record<string, string>;
  prefill: Record<string, unknown>;
  createdAt: string;
}

export interface RecipientInput {
  ref: string;
  name?: string;
  channels: Record<string, string>;
  prefill?: Record<string, unknown>;
}

export interface CreateCampaignInput {
  name: string;
  schema_id: string;
  deadline: string;
  reminders: Reminder[];
  webhook_url?: string;
  status?: CampaignStatus;
}

export interface PatchCampaignInput {
  status?: CampaignStatus;
  reminders?: Reminder[];
  deadline?: string;
}

export interface CreateSchemaInput {
  name: string;
  fields: FormField[];
}
