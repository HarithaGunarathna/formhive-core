// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
  size?: number;
}

export function Spinner({ className, size = 20 }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-[var(--color-muted-foreground)]', className)}
      size={size}
      aria-label="Loading"
    />
  );
}
