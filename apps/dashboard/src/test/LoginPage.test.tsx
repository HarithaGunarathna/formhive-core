// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation } from '@tanstack/react-query';
import { LoginPage } from '@/pages/LoginPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    useMutation: vi.fn(),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  };
});

vi.mock('@/api/auth', () => ({
  useLogin: vi.fn(),
}));

import { useLogin } from '@/api/auth';

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders account name input, password input, and sign in button', () => {
    vi.mocked(useLogin).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useMutation>);

    renderLogin();

    expect(screen.getByLabelText(/account name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows error message when login mutation rejects', async () => {
    vi.mocked(useLogin).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('INVALID_CREDENTIALS')),
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useMutation>);

    renderLogin();

    fireEvent.change(screen.getByLabelText(/account name/i), {
      target: { value: 'agri_ministry' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid account name or password/i)).toBeInTheDocument();
    });
  });

  it('redirects to /campaigns on successful login', async () => {
    vi.mocked(useLogin).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ token: 'tok_abc' }),
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useMutation>);

    renderLogin();

    fireEvent.change(screen.getByLabelText(/account name/i), {
      target: { value: 'agri_ministry' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'testpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/campaigns', { replace: true });
    });
  });

  it('sign in button is disabled while mutation is pending', () => {
    vi.mocked(useLogin).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useMutation>);

    renderLogin();

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });
});
