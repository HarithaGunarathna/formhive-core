// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRegister } from '@/api/auth';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ACCOUNT_NAME_RE = /^[a-z0-9_]{3,30}$/;

const registerSchema = z
  .object({
    account_name: z
      .string()
      .min(3, 'At least 3 characters')
      .max(30, 'At most 30 characters')
      .regex(ACCOUNT_NAME_RE, 'Lowercase letters, numbers and underscores only'),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'At least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

function accountNameColor(status: AvailabilityStatus): string {
  if (status === 'available') return 'text-[var(--color-success)]';
  if (status === 'taken' || status === 'invalid') return 'text-[var(--color-destructive)]';
  return 'text-[var(--color-muted-foreground)]';
}

function accountNameHint(status: AvailabilityStatus): string | null {
  if (status === 'available') return 'Available ✓';
  if (status === 'taken') return 'Already taken';
  if (status === 'checking') return 'Checking…';
  return null;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityStatus>('idle');

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const accountNameValue = watch('account_name');

  const checkAvailability = async () => {
    const name = accountNameValue;
    if (!name || !ACCOUNT_NAME_RE.test(name)) {
      setAvailability('invalid');
      return;
    }
    setAvailability('checking');
    try {
      const res = await apiClient.get<{ data: { available: boolean } }>(
        `/v1/auth/check-account-name?name=${encodeURIComponent(name)}`,
      );
      setAvailability(res.data.data.available ? 'available' : 'taken');
    } catch {
      setAvailability('idle');
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerMutation.mutateAsync({
        account_name: values.account_name,
        email: values.email,
        password: values.password,
      });
      navigate('/login', {
        state: { message: 'Account created successfully. Sign in to continue.' },
      });
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data;
      const code = data?.error?.code;
      if (code === 'ACCOUNT_NAME_TAKEN') {
        setError('account_name', { message: 'This account name is already taken' });
        setAvailability('taken');
      } else if (code === 'EMAIL_TAKEN') {
        setError('email', {
          message: 'An account with this email already exists. Try logging in.',
        });
      }
    }
  });

  const hint = accountNameHint(availability);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-muted)] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Start collecting data with Formhive</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Account name */}
            <div className="space-y-1">
              <Label htmlFor="account_name">Account name</Label>
              <Input
                id="account_name"
                type="text"
                placeholder="Your account name"
                autoFocus
                autoComplete="username"
                {...register('account_name')}
                onBlur={checkAvailability}
              />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                3–30 characters. Letters, numbers, and underscores only. No spaces.
              </p>
              {errors.account_name && (
                <p className="text-sm text-[var(--color-destructive)]">
                  {errors.account_name.message}
                </p>
              )}
              {!errors.account_name && hint && (
                <p className={`text-sm ${accountNameColor(availability)}`}>{hint}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-[var(--color-destructive)]">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-[var(--color-destructive)]">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1">
              <Label htmlFor="confirm_password">Confirm password</Label>
              <div className="relative">
                <Input
                  id="confirm_password"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  {...register('confirm_password')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                >
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.confirm_password && (
                <p className="text-sm text-[var(--color-destructive)]">
                  {errors.confirm_password.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? 'Creating account…' : 'Create account'}
            </Button>

            <p className="text-center text-sm text-[var(--color-muted-foreground)]">
              Already have an account?{' '}
              <Link to="/login" className="text-[var(--color-foreground)] hover:underline">
                Sign in →
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
