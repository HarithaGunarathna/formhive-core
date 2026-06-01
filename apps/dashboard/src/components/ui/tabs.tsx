// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Tab<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  tabs: ReadonlyArray<Tab<T>>;
  value: T;
  onChange: (value: T) => void;
  children?: ReactNode;
  className?: string;
}

export function Tabs<T extends string>({ tabs, value, onChange, children, className }: TabsProps<T>) {
  return (
    <div className={cn('w-full', className)}>
      <div
        role="tablist"
        className="inline-flex h-10 items-center rounded-md bg-[var(--color-muted)] p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={tab.value === value}
            onClick={() => onChange(tab.value)}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium transition-all',
              tab.value === value
                ? 'bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
