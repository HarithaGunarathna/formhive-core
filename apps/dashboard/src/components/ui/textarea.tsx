// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 py-2 text-sm',
          'placeholder:text-[var(--color-muted-foreground)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'font-mono',
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';
