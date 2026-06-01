// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap, type ApiEnvelope } from './client';
import type { Submission } from './types';

interface GetSubmissionsOptions {
  refetchInterval?: number | false;
}

export function useGetSubmissions(
  campaignId: string | undefined,
  page = 1,
  limit = 50,
  options: GetSubmissionsOptions = {},
) {
  return useQuery({
    queryKey: ['submissions', campaignId, page, limit],
    enabled: Boolean(campaignId),
    refetchInterval: options.refetchInterval ?? false,
    queryFn: async (): Promise<Submission[]> => {
      const res = await apiClient.get<ApiEnvelope<Submission[]>>(
        `/v1/campaigns/${campaignId}/submissions`,
        { params: { page, limit } },
      );
      return unwrap(res.data, res.status);
    },
  });
}
