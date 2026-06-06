// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 Formhive Contributors

import * as nodemailer from 'nodemailer';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter(): ReturnType<typeof nodemailer.createTransport> {
  if (!transporter) {
    const SMTP_HOST = process.env['SMTP_HOST'];
    const SMTP_PORT = process.env['SMTP_PORT'];
    const SMTP_USER = process.env['SMTP_USER'];
    const SMTP_PASS = process.env['SMTP_PASS'];

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS env vars are required');
    }

    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
      secure: true,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }
  return transporter;
}

const WRAPPER_OPEN = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;padding:40px;max-width:560px;">
      <tr><td style="color:#0f172a;font-size:15px;line-height:1.6;">`;

const WRAPPER_CLOSE = `
      </td></tr>
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px;">Sent by Formhive</p>
  </td></tr>
</table>
</body></html>`;

function cta(url: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr><td style="border-radius:6px;background-color:#0f172a;">
      <a href="${url}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;border-radius:6px;">${label}</a>
    </td></tr>
  </table>`;
}

function getEmailTemplate(
  templateName: string,
  variables: Record<string, string>,
): { subject: string; html: string } {
  const { campaign_name, submit_url, name } = variables;

  switch (templateName) {
    case 'opening':
      return {
        subject: `Please fill in: ${campaign_name}`,
        html: WRAPPER_OPEN + `
          <p style="margin:0 0 16px;">Hello${name ? ` ${name}` : ''},</p>
          <p style="margin:0 0 16px;">You have been invited to participate in <strong>${campaign_name}</strong>. It only takes a few minutes to complete.</p>
          ${cta(submit_url, 'Fill in the form')}
          <p style="margin:0;color:#64748b;font-size:13px;">If the button above does not work, copy this link into your browser:<br>
          <a href="${submit_url}" style="color:#0f172a;word-break:break-all;">${submit_url}</a></p>
        ` + WRAPPER_CLOSE,
      };
    case 'reminder':
      return {
        subject: `Reminder: ${campaign_name} is waiting for your response`,
        html: WRAPPER_OPEN + `
          <p style="margin:0 0 16px;">Hello${name ? ` ${name}` : ''},</p>
          <p style="margin:0 0 16px;">We noticed you have not yet submitted your response to <strong>${campaign_name}</strong>. Your input is important to us.</p>
          ${cta(submit_url, 'Submit your response')}
          <p style="margin:0;color:#64748b;font-size:13px;">If the button above does not work, copy this link into your browser:<br>
          <a href="${submit_url}" style="color:#0f172a;word-break:break-all;">${submit_url}</a></p>
        ` + WRAPPER_CLOSE,
      };
    case 'final_warning':
      return {
        subject: `Final reminder: ${campaign_name} closes soon`,
        html: WRAPPER_OPEN + `
          <p style="margin:0 0 16px;">Hello${name ? ` ${name}` : ''},</p>
          <p style="margin:0 0 16px;">This is your final reminder. <strong>${campaign_name}</strong> is closing soon and we have not received your response yet. Please take a moment to complete it now.</p>
          ${cta(submit_url, 'Submit before it closes')}
          <p style="margin:0;color:#64748b;font-size:13px;">If the button above does not work, copy this link into your browser:<br>
          <a href="${submit_url}" style="color:#0f172a;word-break:break-all;">${submit_url}</a></p>
        ` + WRAPPER_CLOSE,
      };
    default:
      return {
        subject: campaign_name,
        html: WRAPPER_OPEN + `
          <p style="margin:0 0 16px;">Hello${name ? ` ${name}` : ''},</p>
          ${cta(submit_url, 'Open form')}
        ` + WRAPPER_CLOSE,
      };
  }
}

export async function sendEmail(
  to: string,
  templateName: string,
  variables: Record<string, string>,
): Promise<void> {
  const { subject, html } = getEmailTemplate(templateName, variables);
  const EMAIL_FROM = process.env['EMAIL_FROM'];

  if (!EMAIL_FROM) {
    throw new Error('EMAIL_FROM environment variable is not set');
  }

  const transport = getTransporter();
  await transport.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });
}
