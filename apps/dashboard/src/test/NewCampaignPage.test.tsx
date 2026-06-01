// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewCampaignPage } from '@/pages/NewCampaignPage';

const { mockApiPatch } = vi.hoisted(() => ({ mockApiPatch: vi.fn() }));
const mockNavigate = vi.fn();
const mockCreateSchemaMutate = vi.fn();
const mockCreateRecipientsMutate = vi.fn();
const mockCreateCampaignMutate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/api/schemas', () => ({
  useCreateSchema: vi.fn(),
}));

vi.mock('@/api/recipients', () => ({
  useCreateRecipients: vi.fn(),
}));

vi.mock('@/api/campaigns', () => ({
  useCreateCampaign: vi.fn(),
}));

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, apiClient: { patch: mockApiPatch } };
});

import { useCreateSchema } from '@/api/schemas';
import { useCreateRecipients } from '@/api/recipients';
import { useCreateCampaign } from '@/api/campaigns';

const IDLE_MUTATION = { isPending: false, isError: false, error: null };

function setupMutations() {
  vi.mocked(useCreateSchema).mockReturnValue({
    mutateAsync: mockCreateSchemaMutate,
    ...IDLE_MUTATION,
  } as ReturnType<typeof useCreateSchema>);

  vi.mocked(useCreateRecipients).mockReturnValue({
    mutateAsync: mockCreateRecipientsMutate,
    ...IDLE_MUTATION,
  } as ReturnType<typeof useCreateRecipients>);

  vi.mocked(useCreateCampaign).mockReturnValue({
    mutateAsync: mockCreateCampaignMutate,
    ...IDLE_MUTATION,
  } as ReturnType<typeof useCreateCampaign>);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <NewCampaignPage />
    </MemoryRouter>,
  );
}

// Helper: fill step 1 and advance to step 2
async function advanceToStep2() {
  fireEvent.change(screen.getByLabelText(/campaign name/i), {
    target: { value: 'Test Campaign' },
  });
  fireEvent.change(screen.getByLabelText(/deadline/i), {
    target: { value: '2026-12-31T12:00' },
  });
  // Fill in the default blank field's label
  fireEvent.change(screen.getByPlaceholderText(/e\.g\. hectares/i), {
    target: { value: 'Plot size' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
  await waitFor(() => {
    expect(screen.getByRole('tab', { name: /add manually/i })).toBeInTheDocument();
  });
}

// Helper: add one recipient in manual tab and advance to step 3
async function advanceToStep3() {
  await advanceToStep2();

  // Switch to manual tab
  fireEvent.click(screen.getByRole('tab', { name: /add manually/i }));
  fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));

  const refInputs = screen.getAllByPlaceholderText(/farmer-001/i);
  fireEvent.change(refInputs[0], { target: { value: 'farmer-001' } });

  const phoneInputs = screen.getAllByPlaceholderText(/\+9477/i);
  fireEvent.change(phoneInputs[0], { target: { value: '+94771234567' } });

  fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
  await waitFor(() => {
    expect(screen.getByText(/review & launch/i)).toBeInTheDocument();
  });
}

describe('NewCampaignPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMutations();
    mockCreateSchemaMutate.mockResolvedValue({
      id: 'schema-1', name: 'Test Campaign schema', fields: [], version: 1,
      tenantId: 't1', createdAt: '',
    });
    mockCreateRecipientsMutate.mockResolvedValue({ created: 1, updated: 0 });
    mockCreateCampaignMutate.mockResolvedValue({
      id: 'camp-new', name: 'Test Campaign', status: 'draft',
      schemaId: 'schema-1', deadline: '', reminders: [],
      webhookUrl: null, tenantId: 't1', createdAt: '',
    });
    mockApiPatch.mockResolvedValue({ data: { data: null, error: null } });
  });

  describe('Step 1 — Form fields', () => {
    it('Next button is disabled when campaign name is empty', () => {
      renderPage();

      const next = screen.getByRole('button', { name: /^next$/i });
      expect(next).toBeDisabled();
    });

    it('Next button remains disabled when name is filled but no field label exists', () => {
      renderPage();

      fireEvent.change(screen.getByLabelText(/campaign name/i), {
        target: { value: 'My Campaign' },
      });
      // Field label is still blank
      expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
    });

    it('Next button is enabled after name and at least one field label are filled', () => {
      renderPage();

      fireEvent.change(screen.getByLabelText(/campaign name/i), {
        target: { value: 'My Campaign' },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. hectares/i), {
        target: { value: 'Plot size' },
      });
      expect(screen.getByRole('button', { name: /^next$/i })).not.toBeDisabled();
    });

    it('select_one field type shows options input', () => {
      renderPage();

      // Change the default field type to select_one
      const typeSelect = screen.getByRole('combobox', { name: /type/i });
      fireEvent.change(typeSelect, { target: { value: 'select_one' } });

      expect(screen.getByLabelText(/options.*comma/i)).toBeInTheDocument();
    });
  });

  describe('Step 2 — Recipients', () => {
    it('CSV paste tab parses ref, name, phone, email correctly', async () => {
      renderPage();
      // Fill step 1 minimally and advance to step 2
      fireEvent.change(screen.getByLabelText(/campaign name/i), {
        target: { value: 'Survey' },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. hectares/i), {
        target: { value: 'Plot size' },
      });
      fireEvent.change(screen.getByLabelText(/deadline/i), {
        target: { value: '2026-12-31T12:00' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
      await waitFor(() => screen.getByRole('tab', { name: /paste csv/i }));

      const csv = 'ref,name,phone,email\nfarmer-001,Alice,+94771234567,alice@example.com';
      fireEvent.change(screen.getByLabelText(/paste csv/i), {
        target: { value: csv },
      });

      await waitFor(() => {
        expect(screen.getByText(/parsed 1 recipient/i)).toBeInTheDocument();
        expect(screen.getByText('farmer-001')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });
    });

    it('shows validation error when ref column is missing from CSV', async () => {
      renderPage();
      fireEvent.change(screen.getByLabelText(/campaign name/i), {
        target: { value: 'Survey' },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. hectares/i), {
        target: { value: 'Plot size' },
      });
      fireEvent.change(screen.getByLabelText(/deadline/i), {
        target: { value: '2026-12-31T12:00' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
      await waitFor(() => screen.getByRole('tab', { name: /paste csv/i }));

      // CSV without ref column
      fireEvent.change(screen.getByLabelText(/paste csv/i), {
        target: { value: 'name,phone\nAlice,+9477' },
      });

      await waitFor(() => {
        expect(screen.getByText(/must include a "ref" column/i)).toBeInTheDocument();
      });
    });
  });

  describe('Step 3 — Review & launch', () => {
    it('shows correct field count and recipient count in summary', async () => {
      renderPage();
      await advanceToStep3();

      // Both field count and recipient count are '1' — two distinct elements
      expect(screen.getAllByText('1')).toHaveLength(2);
    });

    it('"Save as draft" calls createSchema, createRecipients, createCampaign with status draft', async () => {
      renderPage();
      await advanceToStep3();

      fireEvent.click(screen.getByRole('button', { name: /save as draft/i }));

      await waitFor(() => {
        expect(mockCreateSchemaMutate).toHaveBeenCalled();
        expect(mockCreateRecipientsMutate).toHaveBeenCalled();
        expect(mockCreateCampaignMutate).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'draft' }),
        );
      });
    });

    it('"Launch now" calls createCampaign then patches campaign with status: active', async () => {
      renderPage();
      await advanceToStep3();

      fireEvent.click(screen.getByRole('button', { name: /launch now/i }));

      await waitFor(() => {
        expect(mockCreateCampaignMutate).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'draft' }),
        );
        expect(mockApiPatch).toHaveBeenCalledWith(
          '/v1/campaigns/camp-new',
          { status: 'active' },
        );
      });
    });

    it('navigates to campaign detail page after successful launch', async () => {
      renderPage();
      await advanceToStep3();

      fireEvent.click(screen.getByRole('button', { name: /launch now/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/campaigns/camp-new');
      });
    });
  });
});
