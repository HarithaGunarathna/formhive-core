// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

const WHATSAPP_API_URL = process.env['WHATSAPP_API_URL'];

if (!WHATSAPP_API_URL) {
  throw new Error('WHATSAPP_API_URL environment variable is not set');
}

export async function sendWhatsapp(to: string, templateName: string): Promise<void> {
  if (WHATSAPP_API_URL === 'stub') {
    console.log(`[WHATSAPP STUB] To: ${to} | Template: ${templateName}`);
    return;
  }

  const response = await fetch(WHATSAPP_API_URL as string, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, templateName }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp API error: ${response.statusText}`);
  }
}
