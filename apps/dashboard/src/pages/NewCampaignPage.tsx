// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCreateSchema } from '@/api/schemas';
import { useCreateRecipients } from '@/api/recipients';
import { useCreateCampaign } from '@/api/campaigns';
import { apiClient, errorMessage } from '@/api/client';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { StepIndicator } from './wizard/StepIndicator';
import { StepFields, makeBlankField } from './wizard/StepFields';
import { StepRecipients } from './wizard/StepRecipients';
import { StepReview } from './wizard/StepReview';
import {
  TEMPLATE_TEXT,
  type WizardField,
  type WizardRecipient,
  type WizardReminder,
} from './wizard/types';
import type { CreateCampaignInput, FormField, RecipientInput, Reminder } from '@/api/types';

const STEPS = [
  { title: 'Form fields' },
  { title: 'Recipients' },
  { title: 'Review & launch' },
] as const;

function fieldId(label: string, idx: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `field_${idx + 1}`;
}

function buildFormFields(fields: WizardField[]): FormField[] {
  return fields.map((f, i): FormField => {
    const base: FormField = {
      id: fieldId(f.label, i),
      type: f.type === 'image' ? 'image' : f.type,
      label: f.label,
      required: f.required,
    };
    if (f.type === 'select_one') {
      const choices = f.options
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((value) => ({ value, label: value }));
      return { ...base, choices };
    }
    return base;
  });
}

function buildRecipientInputs(recipients: WizardRecipient[]): RecipientInput[] {
  return recipients.map((r) => {
    const channels: Record<string, string> = {};
    if (r.phone) channels.whatsapp = r.phone;
    if (r.email) channels.email = r.email;
    const input: RecipientInput = { ref: r.ref, channels };
    if (r.name) input.name = r.name;
    return input;
  });
}

function buildReminders(reminders: WizardReminder[]): Reminder[] {
  return reminders.map((r): Reminder => {
    const base: Reminder = {
      send_at: new Date(r.send_at).toISOString(),
      channel: r.channel,
      message_template: TEMPLATE_TEXT[r.template],
    };
    if (r.skip_if_submitted) base.only_if = 'not_submitted';
    return base;
  });
}

function validateStep1(
  name: string,
  deadline: string,
  fields: WizardField[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = 'Campaign name is required';
  if (!deadline) errors.deadline = 'Deadline is required';
  else if (Number.isNaN(new Date(deadline).getTime())) errors.deadline = 'Invalid deadline';
  if (fields.length === 0) {
    errors.fields = 'Add at least one form field';
  } else if (fields.some((f) => !f.label.trim())) {
    errors.fields = 'Every field needs a label';
  } else if (
    fields.some(
      (f) =>
        f.type === 'select_one' && f.options.split(',').filter((o) => o.trim()).length === 0,
    )
  ) {
    errors.fields = 'Single-choice fields need at least one option';
  }
  return errors;
}

function validateStep2(recipients: WizardRecipient[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (recipients.length === 0) {
    errors.recipients = 'Add at least one recipient';
    return errors;
  }
  if (recipients.some((r) => !r.ref.trim())) {
    errors.recipients = 'Every recipient needs a ref';
    return errors;
  }
  if (recipients.some((r) => !r.phone.trim() && !r.email.trim())) {
    errors.recipients = 'Every recipient needs a phone or email';
    return errors;
  }
  const refs = recipients.map((r) => r.ref.trim());
  if (new Set(refs).size !== refs.length) {
    errors.recipients = 'Recipient refs must be unique';
  }
  return errors;
}

function validateStep3(reminders: WizardReminder[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (reminders.some((r) => !r.send_at)) {
    errors.reminders = 'Every reminder needs a send time';
  } else if (
    reminders.some((r) => Number.isNaN(new Date(r.send_at).getTime()))
  ) {
    errors.reminders = 'One or more reminders have invalid send times';
  }
  return errors;
}

export function NewCampaignPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [fields, setFields] = useState<WizardField[]>([makeBlankField()]);
  const [recipients, setRecipients] = useState<WizardRecipient[]>([]);
  const [reminders, setReminders] = useState<WizardReminder[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createSchema = useCreateSchema();
  const createRecipients = useCreateRecipients();
  const createCampaign = useCreateCampaign();
  const [activating, setActivating] = useState(false);

  const submitting =
    createSchema.isPending ||
    createRecipients.isPending ||
    createCampaign.isPending ||
    activating;

  const goNext = () => {
    if (step === 1) {
      const stepErrors = validateStep1(name, deadline, fields);
      setErrors(stepErrors);
      if (Object.keys(stepErrors).length === 0) setStep(2);
      return;
    }
    if (step === 2) {
      const stepErrors = validateStep2(recipients);
      setErrors(stepErrors);
      if (Object.keys(stepErrors).length === 0) setStep(3);
      return;
    }
  };

  const goBack = () => {
    setErrors({});
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const submitWizard = async (activate: boolean) => {
    const stepErrors = validateStep3(reminders);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    setSubmitError(null);

    try {
      const schema = await createSchema.mutateAsync({
        name: `${name} schema`,
        fields: buildFormFields(fields),
      });

      await createRecipients.mutateAsync(buildRecipientInputs(recipients));

      const campaignInput: CreateCampaignInput = {
        name,
        schema_id: schema.id,
        deadline: new Date(deadline).toISOString(),
        reminders: buildReminders(reminders),
        status: 'draft',
      };
      const campaign = await createCampaign.mutateAsync(campaignInput);

      if (activate) {
        setActivating(true);
        await apiClient.patch(`/v1/campaigns/${campaign.id}`, { status: 'active' });
        setActivating(false);
      }

      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      setActivating(false);
      setSubmitError(errorMessage(err));
    }
  };

  return (
    <>
      <Header
        title="New campaign"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/campaigns')}>
            <ArrowLeft size={16} />
            Back to campaigns
          </Button>
        }
      />
      <div className="space-y-6 p-8">
        <StepIndicator current={step} steps={STEPS} />

        {step === 1 && (
          <StepFields
            name={name}
            deadline={deadline}
            fields={fields}
            errors={errors}
            onNameChange={setName}
            onDeadlineChange={setDeadline}
            onFieldsChange={setFields}
          />
        )}
        {step === 2 && (
          <StepRecipients
            recipients={recipients}
            errors={errors}
            onRecipientsChange={setRecipients}
          />
        )}
        {step === 3 && (
          <StepReview
            name={name}
            deadline={deadline}
            fields={fields}
            recipients={recipients}
            reminders={reminders}
            onRemindersChange={setReminders}
          />
        )}

        {errors.reminders && (
          <p className="text-sm text-[var(--color-destructive)]">{errors.reminders}</p>
        )}
        {submitError && (
          <p className="text-sm text-[var(--color-destructive)]">{submitError}</p>
        )}

        <div className="flex justify-between border-t border-[var(--color-border)] pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={step === 1 || submitting}
          >
            Back
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              onClick={goNext}
              disabled={
                step === 1 &&
                (!name.trim() || !fields.some((f) => f.label.trim()))
              }
            >
              Next
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => submitWizard(false)}
                disabled={submitting}
              >
                {submitting ? 'Saving…' : 'Save as draft'}
              </Button>
              <Button
                type="button"
                onClick={() => submitWizard(true)}
                disabled={submitting}
              >
                {submitting ? 'Launching…' : 'Launch now'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
