// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { useMutation } from '@tanstack/react-query';
import { apiClient, unwrap, type ApiEnvelope } from './client';
import { useAuthStore } from '../store/auth';

interface TokenResponse {
  token: string;
}

export function useLogin() {
  const login = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: async (credentials: {
      account_name: string;
      password: string;
    }): Promise<TokenResponse> => {
      const res = await apiClient.post<ApiEnvelope<TokenResponse>>(
        '/v1/auth/login',
        credentials,
      );
      return unwrap(res.data, res.status);
    },
    onSuccess: ({ token }) => login(token),
  });
}

export interface RegisterResult {
  account_name: string;
  message: string;
}

export function useRegister() {
  return useMutation({
    mutationFn: async (data: {
      account_name: string;
      email: string;
      password: string;
    }): Promise<RegisterResult> => {
      const res = await apiClient.post<ApiEnvelope<RegisterResult>>('/v1/auth/register', data);
      return unwrap(res.data, res.status);
    },
  });
}
