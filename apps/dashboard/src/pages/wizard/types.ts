// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

export type WizardFieldType =
  | 'text'
  | 'decimal'
  | 'integer'
  | 'select_one'
  | 'date'
  | 'file';

export interface WizardField {
  uid: string;
  label: string;
  type: WizardFieldType;
  required: boolean;
  options: string;
}

export interface WizardRecipient {
  uid: string;
  ref: string;
  name: string;
  phone: string;
  email: string;
}

export type ReminderTemplate = 'opening' | 'reminder' | 'final_warning';
export type ReminderChannel = 'whatsapp' | 'sms' | 'email';

export interface WizardReminder {
  uid: string;
  send_at: string;
  channel: ReminderChannel;
  template: ReminderTemplate;
  skip_if_submitted: boolean;
}

export const TEMPLATE_TEXT: Record<ReminderTemplate, string> = {
  opening: 'Please complete the form: {{link}}',
  reminder: 'Reminder — please complete the form by {{deadline}}: {{link}}',
  final_warning: 'Final notice — the form closes soon: {{link}}',
};

export const TEMPLATE_LABEL: Record<ReminderTemplate, string> = {
  opening: 'Opening',
  reminder: 'Reminder',
  final_warning: 'Final warning',
};
