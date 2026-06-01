// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap, type ApiEnvelope } from './client';
import type { CreateSchemaInput, Schema } from './types';

const KEYS = {
  all: ['schemas'] as const,
  list: () => [...KEYS.all, 'list'] as const,
};

export function useGetSchemas() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: async (): Promise<Schema[]> => {
      const res = await apiClient.get<ApiEnvelope<Schema[]>>('/v1/schemas');
      return unwrap(res.data, res.status);
    },
  });
}

export function useCreateSchema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSchemaInput): Promise<Schema> => {
      const res = await apiClient.post<ApiEnvelope<Schema>>('/v1/schemas', input);
      return unwrap(res.data, res.status);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list() });
    },
  });
}
