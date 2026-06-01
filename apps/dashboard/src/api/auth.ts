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
    mutationFn: async (apiKey: string): Promise<TokenResponse> => {
      const res = await apiClient.post<ApiEnvelope<TokenResponse>>('/v1/auth/token', {
        api_key: apiKey,
      });
      return unwrap(res.data, res.status);
    },
    onSuccess: ({ token }) => login(token),
  });
}
