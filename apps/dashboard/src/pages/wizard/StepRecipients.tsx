// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseRecipientsCsv } from '@/lib/csv';
import type { WizardRecipient } from './types';

interface StepRecipientsProps {
  recipients: WizardRecipient[];
  errors: Record<string, string>;
  onRecipientsChange: (r: WizardRecipient[]) => void;
}

let UID = 0;
const newUid = () => `r${++UID}_${Date.now()}`;

export function makeBlankRecipient(): WizardRecipient {
  return { uid: newUid(), ref: '', name: '', phone: '', email: '' };
}

const TABS = [
  { value: 'csv', label: 'Paste CSV' },
  { value: 'manual', label: 'Add manually' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export function StepRecipients({ recipients, errors, onRecipientsChange }: StepRecipientsProps) {
  const [activeTab, setActiveTab] = useState<TabValue>('csv');
  const [csvText, setCsvText] = useState('');

  const parsed = useMemo(() => parseRecipientsCsv(csvText), [csvText]);

  const applyCsv = () => {
    onRecipientsChange(
      parsed.recipients.map((r) => ({
        uid: newUid(),
        ref: r.ref,
        name: r.name ?? '',
        phone: r.channels.whatsapp ?? '',
        email: r.channels.email ?? '',
      })),
    );
    setActiveTab('manual');
  };

  const updateRow = (uid: string, patch: Partial<WizardRecipient>) => {
    onRecipientsChange(
      recipients.map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    );
  };

  const removeRow = (uid: string) => {
    onRecipientsChange(recipients.filter((r) => r.uid !== uid));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipients</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs<TabValue> tabs={TABS} value={activeTab} onChange={setActiveTab} />

        {activeTab === 'csv' ? (
          <div className="space-y-3">
            <Label htmlFor="csvInput">Paste CSV (columns: ref, name, phone, email)</Label>
            <Textarea
              id="csvInput"
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'ref,name,phone,email\nfarmer-001,Alice,+9477...,alice@example.com'}
            />
            {parsed.errors.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-[var(--color-destructive)]">
                {parsed.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            {parsed.recipients.length > 0 && (
              <>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Parsed {parsed.recipients.length} recipient
                  {parsed.recipients.length === 1 ? '' : 's'}. Showing first 5:
                </p>
                <div className="rounded-md border border-[var(--color-border)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ref</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Channels</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.recipients.slice(0, 5).map((r) => (
                        <TableRow key={r.ref}>
                          <TableCell className="font-medium">{r.ref}</TableCell>
                          <TableCell>{r.name ?? '—'}</TableCell>
                          <TableCell className="text-[var(--color-muted-foreground)]">
                            {[r.channels.whatsapp, r.channels.email]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button type="button" size="sm" onClick={applyCsv}>
                  Use these {parsed.recipients.length} recipient
                  {parsed.recipients.length === 1 ? '' : 's'}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {recipients.length === 0 && (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Add at least one recipient. They need a ref and at least one of phone or email.
              </p>
            )}
            {recipients.map((r) => (
              <div
                key={r.uid}
                className="grid gap-3 rounded-md border border-[var(--color-border)] p-4 md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
              >
                <div className="space-y-1">
                  <Label htmlFor={`ref-${r.uid}`}>Ref</Label>
                  <Input
                    id={`ref-${r.uid}`}
                    value={r.ref}
                    onChange={(e) => updateRow(r.uid, { ref: e.target.value })}
                    placeholder="farmer-001"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`name-${r.uid}`}>Name</Label>
                  <Input
                    id={`name-${r.uid}`}
                    value={r.name}
                    onChange={(e) => updateRow(r.uid, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`phone-${r.uid}`}>WhatsApp / phone</Label>
                  <Input
                    id={`phone-${r.uid}`}
                    value={r.phone}
                    onChange={(e) => updateRow(r.uid, { phone: e.target.value })}
                    placeholder="+9477..."
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`email-${r.uid}`}>Email</Label>
                  <Input
                    id={`email-${r.uid}`}
                    type="email"
                    value={r.email}
                    onChange={(e) => updateRow(r.uid, { email: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(r.uid)}
                    aria-label="Remove recipient"
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
              onClick={() => onRecipientsChange([...recipients, makeBlankRecipient()])}
            >
              <Plus size={16} />
              Add recipient
            </Button>
          </div>
        )}

        {errors.recipients && (
          <p className="text-sm text-[var(--color-destructive)]">{errors.recipients}</p>
        )}
      </CardContent>
    </Card>
  );
}
