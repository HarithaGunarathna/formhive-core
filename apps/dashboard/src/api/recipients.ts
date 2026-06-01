// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap, type ApiEnvelope } from './client';
import type { RecipientInput } from './types';

interface BulkCreateResult {
  created: number;
  updated: number;
}

export function useCreateRecipients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipients: RecipientInput[]): Promise<BulkCreateResult> => {
      const res = await apiClient.post<ApiEnvelope<BulkCreateResult>>('/v1/recipients', {
        recipients,
      });
      return unwrap(res.data, res.status);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipients'] });
    },
  });
}
