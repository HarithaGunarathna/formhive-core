// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import type { ReactNode } from 'react';
import { Inbox, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/api/client';

interface ErrorViewProps {
  error: unknown;
  onRetry?: () => void;
  message?: string;
}

export function ErrorView({ error, onRetry, message }: ErrorViewProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--color-border)] p-12 text-center">
      <AlertTriangle size={32} className="text-[var(--color-destructive)]" />
      <p className="mt-3 text-sm font-medium">Something went wrong</p>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        {message ?? errorMessage(error)}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

interface EmptyViewProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyView({ title, description, action, icon }: EmptyViewProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] p-12 text-center">
      <div className="text-[var(--color-muted-foreground)]">{icon ?? <Inbox size={36} />}</div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--color-muted-foreground)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-8 w-20" />
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg border border-[var(--color-border)] p-6"
        >
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
