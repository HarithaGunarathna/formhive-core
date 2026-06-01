// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignsPage } from '@/pages/CampaignsPage';
import type { Campaign, CampaignWithSummary } from '@/api/types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/api/campaigns', () => ({
  useGetCampaigns: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    useQueries: vi.fn(),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  };
});

import { useGetCampaigns } from '@/api/campaigns';
import { useQueries } from '@tanstack/react-query';

const makeCampaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: 'camp-1',
  tenantId: 't1',
  name: 'Rice yield survey',
  schemaId: 'schema-1',
  deadline: '2026-08-01T00:00:00Z',
  reminders: [],
  status: 'active',
  webhookUrl: null,
  createdAt: '2026-06-01T00:00:00Z',
  ...overrides,
});

const makeDetailResult = (
  campaign: Campaign,
  summary = { total: 40, submitted: 14, pending: 26, invalid: 0 },
) => ({
  data: { ...campaign, summary } as CampaignWithSummary,
  isLoading: false,
  isError: false,
});

const LOADING_QUERY = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
const ERROR_QUERY = { data: undefined, isLoading: false, isError: true, error: new Error('Network error'), refetch: vi.fn() };

function renderPage() {
  return render(
    <MemoryRouter>
      <CampaignsPage />
    </MemoryRouter>,
  );
}

describe('CampaignsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows skeleton loading state while fetching', () => {
    vi.mocked(useGetCampaigns).mockReturnValue(LOADING_QUERY as ReturnType<typeof useGetCampaigns>);
    vi.mocked(useQueries).mockReturnValue([]);

    renderPage();

    // Skeleton cards rendered — no campaign names visible
    expect(screen.queryByRole('link', { name: /rice/i })).not.toBeInTheDocument();
  });

  it('shows empty state when campaigns array is empty', () => {
    vi.mocked(useGetCampaigns).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useGetCampaigns>);
    vi.mocked(useQueries).mockReturnValue([]);

    renderPage();

    expect(screen.getByText(/no campaigns yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first campaign/i })).toBeInTheDocument();
  });

  it('renders campaign cards with name, status badge, and progress bar', () => {
    const campaign = makeCampaign();
    vi.mocked(useGetCampaigns).mockReturnValue({
      data: [campaign],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useGetCampaigns>);
    vi.mocked(useQueries).mockReturnValue([makeDetailResult(campaign)] as ReturnType<typeof useQueries>);

    renderPage();

    expect(screen.getByText('Rice yield survey')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    // Progress text: submitted / total
    expect(screen.getByText(/14 \/ 40 submitted/i)).toBeInTheDocument();
  });

  it('clicking a campaign card View button navigates to /campaigns/:id', () => {
    const campaign = makeCampaign();
    vi.mocked(useGetCampaigns).mockReturnValue({
      data: [campaign],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useGetCampaigns>);
    vi.mocked(useQueries).mockReturnValue([makeDetailResult(campaign)] as ReturnType<typeof useQueries>);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /view/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/campaigns/camp-1');
  });

  it.each([
    ['draft', 'Draft'],
    ['active', 'Active'],
    ['closed', 'Closed'],
  ] as const)('status badge shows correct text for %s campaign', (status, label) => {
    const campaign = makeCampaign({ id: `camp-${status}`, status });
    vi.mocked(useGetCampaigns).mockReturnValue({
      data: [campaign],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useGetCampaigns>);
    vi.mocked(useQueries).mockReturnValue([makeDetailResult(campaign)] as ReturnType<typeof useQueries>);

    renderPage();

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows error state with retry button when fetch fails', () => {
    vi.mocked(useGetCampaigns).mockReturnValue(ERROR_QUERY as ReturnType<typeof useGetCampaigns>);
    vi.mocked(useQueries).mockReturnValue([]);

    renderPage();

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
