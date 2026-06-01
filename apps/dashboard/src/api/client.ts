// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive contributors

import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/auth';

export interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string; field?: string } | null;
}

export const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

export class ApiError extends Error {
  code: string;
  field?: string;
  status?: number;

  constructor(code: string, message: string, status?: number, field?: string) {
    super(message);
    this.code = code;
    this.status = status;
    if (field !== undefined) this.field = field;
  }
}

export function unwrap<T>(envelope: ApiEnvelope<T>, status?: number): T {
  if (envelope.error) {
    throw new ApiError(
      envelope.error.code,
      envelope.error.message,
      status,
      envelope.error.field,
    );
  }
  if (envelope.data === null) {
    throw new ApiError('EMPTY_RESPONSE', 'Server returned no data', status);
  }
  return envelope.data;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiEnvelope<unknown> | undefined;
    if (body?.error?.message) return body.error.message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
