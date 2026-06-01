// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--color-border)] px-8">
      <h1 className="text-xl font-medium">{title}</h1>
      <div className="flex items-center gap-3">
        {action}
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut size={16} />
          Logout
        </Button>
      </div>
    </header>
  );
}
