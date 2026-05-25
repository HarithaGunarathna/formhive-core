// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import { EventBus, NOTIFICATIONS_STREAM } from '@formhive/events';
import type { NotificationSendPayload } from '@formhive/events';
import { sendEmail } from './channels/email';
import { sendSms } from './channels/sms';
import { sendWhatsapp } from './channels/whatsapp';

const REDIS_URL = process.env['REDIS_URL'];
if (!REDIS_URL) throw new Error('REDIS_URL environment variable is not set');

const eventBus = new EventBus(REDIS_URL);

async function handleNotificationSend(payload: unknown): Promise<void> {
  const notif = payload as NotificationSendPayload;
  const { to, channel, templateName, variables } = notif;

  try {
    switch (channel) {
      case 'email':
        await sendEmail(to, templateName, variables);
        console.log(`[notification] sent email to ${to} (template: ${templateName})`);
        break;
      case 'sms':
        const smsMessage = `${variables.campaign_name}: ${variables.submit_url}`;
        await sendSms(to, smsMessage);
        console.log(`[notification] sent SMS to ${to}`);
        break;
      case 'whatsapp':
        await sendWhatsapp(to, templateName);
        console.log(`[notification] sent WhatsApp to ${to} (template: ${templateName})`);
        break;
      default:
        console.error(`[notification] unknown channel: ${channel}`);
    }
  } catch (err) {
    console.error(`[notification] failed to send ${channel} to ${to}:`, err);
  }
}

console.log('[notification] service starting…');

void eventBus.consume(NOTIFICATIONS_STREAM, 'notification-group', 'notification-1', (eventName, payload) => {
  if (eventName === 'notification.send') {
    return handleNotificationSend(payload);
  }
  return Promise.resolve();
});
