// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { NavLink } from 'react-router-dom';
import { Megaphone, Users, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/recipients', label: 'Recipients', icon: Users, disabled: true },
  { to: '/schemas', label: 'Schemas', icon: FileText, disabled: true },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-14 flex-col border-r border-[var(--color-border)] bg-[var(--color-muted)] lg:w-60">
      <div className="flex h-16 items-center justify-center px-2 lg:justify-start lg:px-6">
        <span className="hidden text-lg font-medium lg:block">Formhive</span>
        <span className="text-lg font-medium lg:hidden">F</span>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-2 lg:px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, disabled }) => {
          if (disabled) {
            return (
              <div
                key={to}
                title={label}
                className="flex cursor-not-allowed items-center justify-center gap-3 rounded-md px-2 py-2 text-sm text-[var(--color-muted-foreground)] opacity-50 lg:justify-start lg:px-3"
                aria-disabled="true"
              >
                <Icon size={16} />
                <span className="hidden lg:block">{label}</span>
              </div>
            );
          }
          return (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors lg:justify-start lg:px-3',
                  isActive
                    ? 'bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm'
                    : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-background)] hover:text-[var(--color-foreground)]',
                )
              }
            >
              <Icon size={16} />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
