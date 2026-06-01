// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignDetailPage } from '@/pages/CampaignDetailPage';
import type { CampaignWithSummary, Submission } from '@/api/types';

const mockNavigate = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: vi.fn(() => ({ id: 'camp-1' })),
  };
});

vi.mock('@/api/campaigns', () => ({
  useGetCampaign: vi.fn(),
  useUpdateCampaign: vi.fn(),
}));

vi.mock('@/api/submissions', () => ({
  useGetSubmissions: vi.fn(),
}));

import { useGetCampaign, useUpdateCampaign } from '@/api/campaigns';
import { useGetSubmissions } from '@/api/submissions';

const mockCampaign: CampaignWithSummary = {
  id: 'camp-1',
  tenantId: 't1',
  name: 'Rice Yield Survey',
  schemaId: 'schema-1',
  deadline: '2026-08-01T00:00:00Z',
  reminders: [],
  status: 'draft',
  webhookUrl: null,
  createdAt: '2026-06-01T00:00:00Z',
  summary: { total: 40, submitted: 10, pending: 30, invalid: 2 },
};

const mockSubmissions: Submission[] = [
  {
    id: 'sub-1',
    tenantId: 't1',
    campaignId: 'camp-1',
    recipientRef: 'farmer-001',
    submissionToken: null,
    data: { 'Hectares planted': '5', Crop: 'Rice' },
    status: 'valid',
    validationErrors: null,
    submittedAt: '2026-07-15T10:00:00Z',
    createdAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'sub-2',
    tenantId: 't1',
    campaignId: 'camp-1',
    recipientRef: 'farmer-002',
    submissionToken: null,
    data: {},
    status: 'pending',
    validationErrors: null,
    submittedAt: null,
    createdAt: '2026-07-01T00:00:00Z',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <CampaignDetailPage />
    </MemoryRouter>,
  );
}

describe('CampaignDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ ...mockCampaign, status: 'active' });

    vi.mocked(useGetCampaign).mockReturnValue({
      data: mockCampaign,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useGetCampaign>);

    vi.mocked(useGetSubmissions).mockReturnValue({
      data: mockSubmissions,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useGetSubmissions>);

    vi.mocked(useUpdateCampaign).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUpdateCampaign>);
  });

  it('renders campaign name and status badge', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /rice yield survey/i })).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('shows correct pending/valid/invalid counts in stat cards', () => {
    renderPage();

    // summary: total=40, submitted=10, pending=30, invalid=2 → validOnly=8
    expect(screen.getByText('30')).toBeInTheDocument(); // pending
    expect(screen.getByText('8')).toBeInTheDocument();  // valid = submitted(10) - invalid(2)
    expect(screen.getByText('2')).toBeInTheDocument();  // invalid
  });

  it('renders submissions table with recipient_ref and status columns', () => {
    renderPage();

    expect(screen.getByText('farmer-001')).toBeInTheDocument();
    expect(screen.getByText('farmer-002')).toBeInTheDocument();
    // 'Valid' and 'Pending' appear in both stat cards and submission badges
    expect(screen.getAllByText('Valid').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
  });

  it('clicking Activate opens confirm dialog', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^activate$/i }));

    expect(screen.getByText(/activate campaign\?/i)).toBeInTheDocument();
  });

  it('confirming activation calls updateCampaign mutation with status: active', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    // Dialog shows — find the confirm button inside it
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ status: 'active' });
    });
  });

  it('"View data" button opens dialog showing submission field values', () => {
    renderPage();

    // First submission (farmer-001) has data — its View data button should be enabled
    const viewButtons = screen.getAllByRole('button', { name: /view data/i });
    fireEvent.click(viewButtons[0]);

    expect(screen.getByText('Hectares planted')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
