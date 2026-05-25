// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

const SMS_API_URL = process.env['SMS_API_URL'];

if (!SMS_API_URL) {
  throw new Error('SMS_API_URL environment variable is not set');
}

export async function sendSms(to: string, message: string): Promise<void> {
  if (SMS_API_URL === 'stub') {
    console.log(`[SMS STUB] To: ${to} | Message: ${message}`);
    return;
  }

  const response = await fetch(SMS_API_URL as string, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, message }),
  });

  if (!response.ok) {
    throw new Error(`SMS API error: ${response.statusText}`);
  }
}
