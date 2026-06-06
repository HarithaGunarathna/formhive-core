// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { WizardField, WizardFieldType } from './types';

interface StepFieldsProps {
  name: string;
  deadline: string;
  fields: WizardField[];
  errors: Record<string, string>;
  onNameChange: (v: string) => void;
  onDeadlineChange: (v: string) => void;
  onFieldsChange: (f: WizardField[]) => void;
}

const FIELD_TYPES: Array<{ value: WizardFieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'integer', label: 'Integer' },
  { value: 'select_one', label: 'Single choice' },
  { value: 'date', label: 'Date' },
  { value: 'file', label: 'File attachment' },
];

let UID = 0;
const newUid = () => `f${++UID}_${Date.now()}`;

export function makeBlankField(): WizardField {
  return { uid: newUid(), label: '', type: 'text', required: false, options: '' };
}

export function StepFields({
  name,
  deadline,
  fields,
  errors,
  onNameChange,
  onDeadlineChange,
  onFieldsChange,
}: StepFieldsProps) {
  const updateField = (uid: string, patch: Partial<WizardField>) => {
    onFieldsChange(fields.map((f) => (f.uid === uid ? { ...f, ...patch } : f)));
  };

  const removeField = (uid: string) => {
    onFieldsChange(fields.filter((f) => f.uid !== uid));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Campaign details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="campaignName">Campaign name</Label>
            <Input
              id="campaignName"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. Rice yield survey 2026"
            />
            {errors.name && (
              <p className="text-sm text-[var(--color-destructive)]">{errors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline</Label>
            <Input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => onDeadlineChange(e.target.value)}
            />
            {errors.deadline && (
              <p className="text-sm text-[var(--color-destructive)]">{errors.deadline}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Add at least one field to start collecting data.
            </p>
          )}
          {fields.map((field) => (
            <div
              key={field.uid}
              className="grid gap-3 rounded-md border border-[var(--color-border)] p-4 md:grid-cols-[1fr_140px_120px_auto]"
            >
              <div className="space-y-1">
                <Label htmlFor={`label-${field.uid}`}>Label</Label>
                <Input
                  id={`label-${field.uid}`}
                  value={field.label}
                  onChange={(e) => updateField(field.uid, { label: e.target.value })}
                  placeholder="e.g. Hectares planted"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`type-${field.uid}`}>Type</Label>
                <Select
                  id={`type-${field.uid}`}
                  value={field.type}
                  onChange={(e) =>
                    updateField(field.uid, { type: e.target.value as WizardFieldType })
                  }
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`required-${field.uid}`}>Required</Label>
                <div className="flex h-10 items-center">
                  <input
                    id={`required-${field.uid}`}
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(field.uid, { required: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeField(field.uid)}
                  aria-label="Remove field"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              {field.type === 'select_one' && (
                <div className="space-y-1 md:col-span-4">
                  <Label htmlFor={`options-${field.uid}`}>Options (comma-separated)</Label>
                  <Input
                    id={`options-${field.uid}`}
                    value={field.options}
                    onChange={(e) => updateField(field.uid, { options: e.target.value })}
                    placeholder="e.g. Yes, No, Maybe"
                  />
                </div>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onFieldsChange([...fields, makeBlankField()])}
          >
            <Plus size={16} />
            Add field
          </Button>
          {errors.fields && (
            <p className="text-sm text-[var(--color-destructive)]">{errors.fields}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
