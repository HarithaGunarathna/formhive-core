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
      secure: false,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }
  return transporter;
}

function getEmailTemplate(
  templateName: string,
  variables: Record<string, string>,
): { subject: string; html: string } {
  const { campaign_name, submit_url, name } = variables;

  switch (templateName) {
    case 'opening':
      return {
        subject: `Please fill in ${campaign_name}`,
        html: `
          <p>Hello ${name},</p>
          <p>We would like to invite you to participate in <strong>${campaign_name}</strong>.</p>
          <p><a href="${submit_url}">Click here to fill in the form</a></p>
          <p>Thank you for your participation.</p>
        `,
      };
    case 'reminder':
      return {
        subject: `Reminder: ${campaign_name} awaiting your response`,
        html: `
          <p>Hello ${name},</p>
          <p>This is a reminder that we are still waiting for your response to <strong>${campaign_name}</strong>.</p>
          <p><a href="${submit_url}">Click here to submit your response</a></p>
          <p>Thank you.</p>
        `,
      };
    case 'final_warning':
      return {
        subject: `Final reminder: ${campaign_name} closes soon`,
        html: `
          <p>Hello ${name},</p>
          <p>This is a final reminder that <strong>${campaign_name}</strong> is closing soon. Please submit your response as soon as possible.</p>
          <p><a href="${submit_url}">Click here to submit your response now</a></p>
          <p>Thank you.</p>
        `,
      };
    default:
      return {
        subject: campaign_name,
        html: `<p>Hello ${name},</p><p><a href="${submit_url}">Click here</a></p>`,
      };
  }
}

export async function sendEmail(
  to: string,
  templateName: string,
  variables: Record<string, string>,
): Promise<void> {
  const { subject, html } = getEmailTemplate(templateName, variables);
  const SMTP_USER = process.env['SMTP_USER'];

  if (!SMTP_USER) {
    throw new Error('SMTP_USER environment variable is not set');
  }

  const transport = getTransporter();
  await transport.sendMail({
    from: SMTP_USER,
    to,
    subject,
    html,
  });
}
