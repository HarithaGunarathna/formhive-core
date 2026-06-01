// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface StepIndicatorProps {
  current: number;
  steps: ReadonlyArray<{ title: string }>;
}

export function StepIndicator({ current, steps }: StepIndicatorProps) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((step, i) => {
        const num = i + 1;
        const isCurrent = current === num;
        const isDone = current > num;
        return (
          <li key={step.title} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                isDone && 'bg-[var(--color-success)] text-white',
                isCurrent && 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
                !isDone && !isCurrent && 'bg-[var(--color-accent)] text-[var(--color-muted-foreground)]',
              )}
            >
              {isDone ? <Check size={14} /> : num}
            </div>
            <span
              className={cn(
                'text-sm',
                isCurrent ? 'font-medium text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]',
              )}
            >
              {step.title}
            </span>
            {i < steps.length - 1 && (
              <div className="mx-2 h-px w-8 bg-[var(--color-border)]" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
