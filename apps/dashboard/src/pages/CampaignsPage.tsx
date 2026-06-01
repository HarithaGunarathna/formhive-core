// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Plus, Megaphone } from 'lucide-react';
import { useGetCampaigns } from '@/api/campaigns';
import { apiClient, unwrap, type ApiEnvelope } from '@/api/client';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { CardSkeleton, EmptyView, ErrorView, ListSkeleton } from '@/components/StateViews';
import { formatDate, formatStatus } from '@/lib/format';
import type {
  Campaign,
  CampaignStatus,
  CampaignSummary,
  CampaignWithSummary,
} from '@/api/types';

const STATUS_VARIANT: Record<CampaignStatus, 'default' | 'success' | 'warning' | 'destructive'> = {
  draft: 'default',
  active: 'success',
  closed: 'warning',
};

interface Stats {
  total: number;
  active: number;
  closedThisMonth: number;
  totalSubmissions: number;
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function computeStats(
  campaigns: Campaign[],
  summaries: Array<CampaignSummary | undefined>,
): Stats {
  let totalSubmissions = 0;
  for (const s of summaries) {
    if (s) totalSubmissions += s.submitted;
  }
  return {
    total: campaigns.length,
    active: campaigns.filter((c) => c.status === 'active').length,
    closedThisMonth: campaigns.filter((c) => c.status === 'closed' && isThisMonth(c.createdAt)).length,
    totalSubmissions,
  };
}

export function CampaignsPage() {
  const navigate = useNavigate();
  const campaignsQuery = useGetCampaigns();
  const campaigns = campaignsQuery.data ?? [];

  const detailQueries = useQueries({
    queries: campaigns.map((c) => ({
      queryKey: ['campaigns', 'detail', c.id],
      enabled: Boolean(c.id),
      queryFn: async (): Promise<CampaignWithSummary> => {
        const res = await apiClient.get<ApiEnvelope<CampaignWithSummary>>(`/v1/campaigns/${c.id}`);
        return unwrap(res.data, res.status);
      },
    })),
  });

  const summaries = useMemo(() => detailQueries.map((q) => q.data?.summary), [detailQueries]);
  const stats = useMemo(() => computeStats(campaigns, summaries), [campaigns, summaries]);

  return (
    <>
      <Header
        title="Campaigns"
        action={
          <Button size="sm" onClick={() => navigate('/campaigns/new')}>
            <Plus size={16} />
            New campaign
          </Button>
        }
      />
      <div className="space-y-6 p-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {campaignsQuery.isLoading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : (
            <>
              <StatCard label="Total campaigns" value={stats.total} />
              <StatCard label="Active campaigns" value={stats.active} />
              <StatCard label="Closed this month" value={stats.closedThisMonth} />
              <StatCard
                label="Total submissions"
                value={stats.totalSubmissions}
                loading={detailQueries.some((q) => q.isLoading)}
              />
            </>
          )}
        </div>

        {campaignsQuery.isLoading && <ListSkeleton rows={3} />}

        {campaignsQuery.isError && (
          <ErrorView error={campaignsQuery.error} onRetry={() => campaignsQuery.refetch()} />
        )}

        {campaignsQuery.data && campaigns.length === 0 && (
          <EmptyView
            icon={<Megaphone size={36} />}
            title="No campaigns yet"
            description="Create your first campaign to start collecting submissions from recipients."
            action={
              <Button size="sm" onClick={() => navigate('/campaigns/new')}>
                <Plus size={16} />
                Create your first campaign
              </Button>
            }
          />
        )}

        {campaigns.length > 0 && (
          <div className="space-y-3">
            {campaigns.map((c, i) => (
              <CampaignRow
                key={c.id}
                campaign={c}
                summary={summaries[i]}
                onView={() => navigate(`/campaigns/${c.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  loading = false,
}: {
  label: string;
  value: number;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-[var(--color-muted-foreground)]">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-16" />
        ) : (
          <p className="mt-2 text-2xl font-medium">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface CampaignRowProps {
  campaign: Campaign;
  summary: CampaignSummary | undefined;
  onView: () => void;
}

function CampaignRow({ campaign, summary, onView }: CampaignRowProps) {
  const total = summary?.total ?? 0;
  const submitted = summary?.submitted ?? 0;
  const pct = total === 0 ? 0 : Math.round((submitted / total) * 100);
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/campaigns/${campaign.id}`}
              className="text-base font-medium hover:underline"
            >
              {campaign.name}
            </Link>
            <Badge variant={STATUS_VARIANT[campaign.status]}>
              {formatStatus(campaign.status)}
            </Badge>
            <span className="text-sm text-[var(--color-muted-foreground)]">
              Deadline: {formatDate(campaign.deadline)}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            {summary ? (
              <>
                <Progress value={submitted} max={Math.max(total, 1)} className="max-w-md" />
                <span className="whitespace-nowrap text-sm text-[var(--color-muted-foreground)]">
                  {submitted} / {total} submitted ({pct}%)
                </span>
              </>
            ) : (
              <Skeleton className="h-2 w-64" />
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onView}>
          View
        </Button>
      </CardContent>
    </Card>
  );
}

