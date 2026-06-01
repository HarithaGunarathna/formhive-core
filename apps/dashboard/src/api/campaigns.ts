// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap, type ApiEnvelope } from './client';
import type {
  Campaign,
  CampaignWithSummary,
  CreateCampaignInput,
  PatchCampaignInput,
} from './types';

const KEYS = {
  all: ['campaigns'] as const,
  list: () => [...KEYS.all, 'list'] as const,
  detail: (id: string) => [...KEYS.all, 'detail', id] as const,
};

export function useGetCampaigns() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: async (): Promise<Campaign[]> => {
      const res = await apiClient.get<ApiEnvelope<Campaign[]>>('/v1/campaigns');
      return unwrap(res.data, res.status);
    },
  });
}

interface GetCampaignOptions {
  refetchInterval?: number | false;
}

export function useGetCampaign(id: string | undefined, options: GetCampaignOptions = {}) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: options.refetchInterval ?? false,
    queryFn: async (): Promise<CampaignWithSummary> => {
      const res = await apiClient.get<ApiEnvelope<CampaignWithSummary>>(`/v1/campaigns/${id}`);
      return unwrap(res.data, res.status);
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCampaignInput): Promise<Campaign> => {
      const res = await apiClient.post<ApiEnvelope<Campaign>>('/v1/campaigns', input);
      return unwrap(res.data, res.status);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list() });
    },
  });
}

export function useUpdateCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PatchCampaignInput): Promise<Campaign> => {
      const res = await apiClient.patch<ApiEnvelope<Campaign>>(`/v1/campaigns/${id}`, input);
      return unwrap(res.data, res.status);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list() });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}
