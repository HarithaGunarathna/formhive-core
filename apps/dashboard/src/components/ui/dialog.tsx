// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-0 shadow-lg',
        'backdrop:bg-black/40',
        'w-full max-w-md',
        className,
      )}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="p-6">
        {title && <h2 className="text-lg font-medium">{title}</h2>}
        {description && (
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{description}</p>
        )}
        <div className={title || description ? 'mt-4' : ''}>{children}</div>
      </div>
    </dialog>
  );
}
