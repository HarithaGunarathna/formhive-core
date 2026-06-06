// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Eye } from 'lucide-react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useGetCampaign, useUpdateCampaign } from '@/api/campaigns';
import { useGetSubmissions } from '@/api/submissions';
import { errorMessage } from '@/api/client';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CardSkeleton, EmptyView, ErrorView } from '@/components/StateViews';
import { formatDateTime, formatStatus } from '@/lib/format';
import type {
  CampaignStatus,
  Submission,
  SubmissionStatus,
} from '@/api/types';

const CAMPAIGN_STATUS_VARIANT: Record<
  CampaignStatus,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  draft: 'default',
  active: 'success',
  closed: 'warning',
};

const SUBMISSION_STATUS_VARIANT: Record<
  SubmissionStatus,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  pending: 'warning',
  valid: 'success',
  invalid: 'destructive',
};

const PIE_COLORS = {
  pending: '#d97706',
  valid: '#16a34a',
  invalid: '#dc2626',
};

const REFRESH_MS = 30_000;
const PAGE_SIZE = 25;

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<Submission | null>(null);
  const [pendingStatus, setPendingStatus] = useState<CampaignStatus | null>(null);

  const campaignQuery = useGetCampaign(id, { refetchInterval: REFRESH_MS });
  const submissionsQuery = useGetSubmissions(id, page, PAGE_SIZE, { refetchInterval: REFRESH_MS });
  const updateCampaign = useUpdateCampaign(id ?? '');

  const confirmStatusChange = async () => {
    if (!pendingStatus) return;
    try {
      await updateCampaign.mutateAsync({ status: pendingStatus });
      setPendingStatus(null);
    } catch {
      // surfaced via mutation.error below
    }
  };

  if (campaignQuery.isLoading) {
    return (
      <>
        <Header title="Campaign" />
        <div className="space-y-6 p-8">
          <Skeleton className="h-7 w-64" />
          <div className="grid gap-4 md:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </>
    );
  }

  if (campaignQuery.isError || !campaignQuery.data) {
    return (
      <>
        <Header title="Campaign" />
        <div className="p-8">
          <ErrorView
            error={campaignQuery.error}
            onRetry={() => campaignQuery.refetch()}
            message={campaignQuery.data === null ? 'Campaign not found' : undefined}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => navigate('/campaigns')}
          >
            <ArrowLeft size={16} />
            Back to campaigns
          </Button>
        </div>
      </>
    );
  }

  const campaign = campaignQuery.data;
  const summary = campaign.summary;
  const validOnly = Math.max(summary.submitted - summary.invalid, 0);
  const pieData = [
    { name: 'Pending', value: summary.pending, fill: PIE_COLORS.pending },
    { name: 'Valid', value: validOnly, fill: PIE_COLORS.valid },
    { name: 'Invalid', value: summary.invalid, fill: PIE_COLORS.invalid },
  ].filter((d) => d.value > 0);

  const canActivate = campaign.status === 'draft';
  const canClose = campaign.status === 'active';

  return (
    <>
      <Header
        title={campaign.name}
        action={
          <>
            {canActivate && (
              <Button
                size="sm"
                onClick={() => setPendingStatus('active')}
                disabled={updateCampaign.isPending}
              >
                Activate
              </Button>
            )}
            {canClose && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPendingStatus('closed')}
                disabled={updateCampaign.isPending}
              >
                Close
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-6 p-8">
        <Link
          to="/campaigns"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft size={14} />
          Back to campaigns
        </Link>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-6">
            <Badge variant={CAMPAIGN_STATUS_VARIANT[campaign.status]}>
              {formatStatus(campaign.status)}
            </Badge>
            <span className="text-sm text-[var(--color-muted-foreground)]">
              Deadline: {formatDateTime(campaign.deadline)}
            </span>
            <span className="text-sm text-[var(--color-muted-foreground)]">
              {campaign.reminders.length} reminder
              {campaign.reminders.length === 1 ? '' : 's'}
            </span>
          </CardContent>
        </Card>

        {updateCampaign.isError && (
          <p className="text-sm text-[var(--color-destructive)]">
            {errorMessage(updateCampaign.error)}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Pending" value={summary.pending} accent={PIE_COLORS.pending} />
          <StatCard label="Valid" value={validOnly} accent={PIE_COLORS.valid} />
          <StatCard label="Invalid" value={summary.invalid} accent={PIE_COLORS.invalid} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Submission breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.total === 0 ? (
              <EmptyView title="No submissions yet" description="Pie chart will appear once submissions start arriving." />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {submissionsQuery.isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
            {submissionsQuery.isError && (
              <ErrorView
                error={submissionsQuery.error}
                onRetry={() => submissionsQuery.refetch()}
              />
            )}
            {submissionsQuery.data && submissionsQuery.data.length === 0 && (
              <EmptyView title="No submissions on this page" />
            )}
            {submissionsQuery.data && submissionsQuery.data.length > 0 && (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient ref</TableHead>
                      <TableHead>Submitted at</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissionsQuery.data.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.recipientRef}</TableCell>
                        <TableCell className="text-[var(--color-muted-foreground)]">
                          {formatDateTime(s.submittedAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={SUBMISSION_STATUS_VARIANT[s.status]}>
                            {formatStatus(s.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewing(s)}
                            disabled={!s.data || Object.keys(s.data).length === 0}
                          >
                            <Eye size={14} />
                            View data
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PaginationBar
                  page={page}
                  pageSize={PAGE_SIZE}
                  rowCount={submissionsQuery.data.length}
                  onPrev={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => p + 1)}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <SubmissionDataDialog
        submission={viewing}
        onClose={() => setViewing(null)}
      />

      <ConfirmStatusDialog
        nextStatus={pendingStatus}
        campaignName={campaign.name}
        loading={updateCampaign.isPending}
        onConfirm={confirmStatusChange}
        onCancel={() => setPendingStatus(null)}
      />
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
          <p className="text-sm text-[var(--color-muted-foreground)]">{label}</p>
        </div>
        <p className="mt-2 text-2xl font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}

interface PaginationBarProps {
  page: number;
  pageSize: number;
  rowCount: number;
  onPrev: () => void;
  onNext: () => void;
}

function PaginationBar({ page, pageSize, rowCount, onPrev, onNext }: PaginationBarProps) {
  const start = (page - 1) * pageSize + 1;
  const end = start + rowCount - 1;
  return (
    <div className="mt-4 flex items-center justify-between">
      <span className="text-sm text-[var(--color-muted-foreground)]">
        Showing {start}–{end}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={page === 1}>
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={rowCount < pageSize}>
          Next
        </Button>
      </div>
    </div>
  );
}

function SubmissionDataDialog({
  submission,
  onClose,
}: {
  submission: Submission | null;
  onClose: () => void;
}) {
  const open = Boolean(submission);
  const entries = submission ? Object.entries(submission.data ?? {}) : [];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={submission ? `Submission — ${submission.recipientRef}` : ''}
      className="max-w-lg"
    >
      <div className="space-y-3">
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No data submitted yet.</p>
        ) : (
          <dl className="divide-y divide-[var(--color-border)] text-sm">
            {entries.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[140px_1fr] gap-3 py-2">
                <dt className="font-medium text-[var(--color-muted-foreground)]">{k}</dt>
                <dd className="break-words">{renderValue(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        {submission?.validationErrors && submission.validationErrors.length > 0 && (
          <div className="rounded-md border border-[var(--color-destructive)] bg-red-50 p-3 text-sm">
            <p className="font-medium text-[var(--color-destructive)]">Validation errors</p>
            <ul className="mt-1 list-disc pl-5 text-[var(--color-destructive)]">
              {submission.validationErrors.map((e, i) => (
                <li key={i}>
                  {e.field ? `${e.field}: ` : ''}
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'ogg', 'wav', 'webm']);

function renderValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') {
    if (/^https?:\/\//.test(v)) {
      const ext = v.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
      if (IMAGE_EXTS.has(ext)) {
        return (
          <a href={v} target="_blank" rel="noreferrer">
            <img
              src={v}
              alt="submission"
              className="max-w-full max-h-48 rounded cursor-pointer hover:opacity-90"
            />
          </a>
        );
      }
      if (AUDIO_EXTS.has(ext)) {
        return <audio controls src={v} className="w-full mt-1" />;
      }
      return (
        <a href={v} target="_blank" rel="noreferrer" className="underline text-[var(--color-foreground)] hover:opacity-70">
          Download file ↗
        </a>
      );
    }
    return v;
  }
  return JSON.stringify(v);
}

interface ConfirmStatusDialogProps {
  nextStatus: CampaignStatus | null;
  campaignName: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmStatusDialog({
  nextStatus,
  campaignName,
  loading,
  onConfirm,
  onCancel,
}: ConfirmStatusDialogProps) {
  const open = nextStatus !== null;
  const isActivating = nextStatus === 'active';
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={isActivating ? 'Activate campaign?' : 'Close campaign?'}
      description={
        isActivating
          ? `Activating “${campaignName}” will send the campaign link to all recipients and start the reminder schedule.`
          : `Closing “${campaignName}” will stop new submissions and cancel any pending reminders.`
      }
    >
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant={isActivating ? 'default' : 'destructive'}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Working…' : 'Confirm'}
        </Button>
      </div>
    </Dialog>
  );
}
