// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

// API response envelope — all endpoints return this shape
export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

// XLSForm field types — aligns with KoboToolbox / ODK standard for import compatibility
export type XlsFormFieldType =
  | 'text'
  | 'decimal'
  | 'integer'
  | 'select_one'
  | 'select_multiple'
  | 'date'
  | 'geopoint'
  | 'image'
  | 'audio';

export interface FormField {
  id: string;
  type: XlsFormFieldType;
  label: string;
  required?: boolean;
  hint?: string;
  choices?: Array<{ value: string; label: string }>;
}

export type CampaignStatus = 'draft' | 'active' | 'closed';
export type SubmissionStatus = 'pending' | 'valid' | 'invalid';
