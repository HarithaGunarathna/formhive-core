// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';

const FILE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
};

export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const ALLOWED_AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm']);

export function extForMime(mimeType: string): string {
  return FILE_TYPES[mimeType] ?? path.extname(mimeType) ?? '.bin';
}

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: process.env['R2_ENDPOINT'],
      region: 'auto',
      credentials: {
        accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
        secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
      },
      forcePathStyle: true, // required for MinIO and R2 path-style
    });
  }
  return _client;
}

/**
 * Upload a file buffer to object storage and return the public URL.
 * Key format: {tenantId}/{campaignId}/{submissionId}/{fieldId}{ext}
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const bucket = process.env['R2_BUCKET'] ?? 'formhive';
  const publicUrl = (process.env['R2_PUBLIC_URL'] ?? '').replace(/\/$/, '');

  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return `${publicUrl}/${key}`;
}

export function buildObjectKey(
  tenantId: string,
  campaignId: string,
  submissionId: string,
  fieldId: string,
  mimeType: string,
): string {
  const ext = extForMime(mimeType);
  return `${tenantId}/${campaignId}/${submissionId}/${fieldId}${ext}`;
}
