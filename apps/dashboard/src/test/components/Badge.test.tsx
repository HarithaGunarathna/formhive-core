// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders correct text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies correct colour class for default variant', () => {
    const { container } = render(<Badge variant="default">Draft</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/bg-\[var\(--color-accent\)\]/);
  });

  it('applies correct colour class for success variant', () => {
    const { container } = render(<Badge variant="success">Active</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/bg-green-100/);
  });

  it('applies correct colour class for warning variant', () => {
    const { container } = render(<Badge variant="warning">Closed</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/bg-amber-100/);
  });

  it('applies correct colour class for destructive variant', () => {
    const { container } = render(<Badge variant="destructive">Invalid</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/bg-red-100/);
  });

  it('applies correct colour class for outline variant', () => {
    const { container } = render(<Badge variant="outline">Outline</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/border/);
  });
});
