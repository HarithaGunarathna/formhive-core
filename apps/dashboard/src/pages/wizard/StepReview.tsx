// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatDateTime } from '@/lib/format';
import {
  TEMPLATE_LABEL,
  type ReminderChannel,
  type ReminderTemplate,
  type WizardField,
  type WizardRecipient,
  type WizardReminder,
} from './types';

interface StepReviewProps {
  name: string;
  deadline: string;
  fields: WizardField[];
  recipients: WizardRecipient[];
  reminders: WizardReminder[];
  onRemindersChange: (r: WizardReminder[]) => void;
}

let UID = 0;
const newUid = () => `rm${++UID}_${Date.now()}`;

export function makeBlankReminder(): WizardReminder {
  return {
    uid: newUid(),
    send_at: '',
    channel: 'whatsapp',
    template: 'reminder',
    skip_if_submitted: true,
  };
}

export function StepReview({
  name,
  deadline,
  fields,
  recipients,
  reminders,
  onRemindersChange,
}: StepReviewProps) {
  const updateReminder = (uid: string, patch: Partial<WizardReminder>) => {
    onRemindersChange(reminders.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  const removeReminder = (uid: string) => {
    onRemindersChange(reminders.filter((r) => r.uid !== uid));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-[var(--color-muted-foreground)]">Name</dt>
            <dd className="font-medium">{name || '—'}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Deadline</dt>
            <dd className="font-medium">
              {deadline ? formatDateTime(deadline) : '—'}
            </dd>
            <dt className="text-[var(--color-muted-foreground)]">Form fields</dt>
            <dd className="font-medium">{fields.length}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Recipients</dt>
            <dd className="font-medium">{recipients.length}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reminders.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No reminders configured. Recipients will only receive the initial campaign link.
            </p>
          )}
          {reminders.map((r) => (
            <div
              key={r.uid}
              className="grid gap-3 rounded-md border border-[var(--color-border)] p-4 md:grid-cols-[1fr_140px_180px_auto_auto]"
            >
              <div className="space-y-1">
                <Label htmlFor={`send-${r.uid}`}>Send at</Label>
                <Input
                  id={`send-${r.uid}`}
                  type="datetime-local"
                  value={r.send_at}
                  onChange={(e) => updateReminder(r.uid, { send_at: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`channel-${r.uid}`}>Channel</Label>
                <Select
                  id={`channel-${r.uid}`}
                  value={r.channel}
                  onChange={(e) =>
                    updateReminder(r.uid, { channel: e.target.value as ReminderChannel })
                  }
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`template-${r.uid}`}>Template</Label>
                <Select
                  id={`template-${r.uid}`}
                  value={r.template}
                  onChange={(e) =>
                    updateReminder(r.uid, { template: e.target.value as ReminderTemplate })
                  }
                >
                  {(Object.keys(TEMPLATE_LABEL) as ReminderTemplate[]).map((t) => (
                    <option key={t} value={t}>
                      {TEMPLATE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`skip-${r.uid}`}>Skip if submitted</Label>
                <div className="flex h-10 items-center">
                  <input
                    id={`skip-${r.uid}`}
                    type="checkbox"
                    checked={r.skip_if_submitted}
                    onChange={(e) =>
                      updateReminder(r.uid, { skip_if_submitted: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeReminder(r.uid)}
                  aria-label="Remove reminder"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRemindersChange([...reminders, makeBlankReminder()])}
          >
            <Plus size={16} />
            Add reminder
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
