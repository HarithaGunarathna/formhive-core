// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  account_name: z.string().min(1, 'Account name is required'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = (location.state as { message?: string } | null)?.message ?? null;
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setLoginError(null);
    try {
      await login.mutateAsync({ account_name: values.account_name, password: values.password });
      navigate('/campaigns', { replace: true });
    } catch {
      setLoginError('Invalid account name or password');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-muted)] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Formhive</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          {successMessage && (
            <div className="mb-4 rounded-md bg-[var(--color-success)] px-3 py-2 text-sm text-white">
              {successMessage}
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account_name">Account name</Label>
              <Input
                id="account_name"
                type="text"
                placeholder="Your account name"
                autoComplete="username"
                autoFocus
                {...register('account_name')}
              />
              {errors.account_name && (
                <p className="text-sm text-[var(--color-destructive)]">
                  {errors.account_name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
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
            {loginError && (
              <p className="text-sm text-[var(--color-destructive)]">{loginError}</p>
            )}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-center text-sm text-[var(--color-muted-foreground)]">
              Don't have an account?{' '}
              <Link to="/register" className="text-[var(--color-foreground)] hover:underline">
                Register →
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
