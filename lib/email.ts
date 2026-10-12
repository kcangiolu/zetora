import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { serverEnv } from '@/env/server';
import SearchCompletedEmail from '@/components/emails/lookout-completed';
import VerifyEmailTemplate from '@/components/emails/verify-email';
import TwoFactorOtpEmailTemplate from '@/components/emails/two-factor-otp';
import { render } from '@react-email/render';

import { createLogger } from '@/lib/logger';

const log = createLogger('email');

// Every email goes out over SMTP — any provider works, including hosted ones
// with an SMTP relay (Resend, Postmark, Mailgun...).

interface SendEmailParams {
  to: string;
  subject: string;
  react: React.ReactElement;
}

let smtpTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter {
  const missing = (['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const).filter((name) => !serverEnv[name]);
  if (missing.length > 0) {
    throw new Error(`Email is not configured: set ${missing.join(', ')} (see .env.example)`);
  }
  smtpTransporter ??= nodemailer.createTransport({
    host: serverEnv.SMTP_HOST,
    port: serverEnv.SMTP_PORT,
    secure: serverEnv.SMTP_SECURE,
    auth: {
      user: serverEnv.SMTP_USER,
      pass: serverEnv.SMTP_PASS,
    },
  });
  return smtpTransporter;
}

async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const transporter = getSmtpTransporter();
    const info = await transporter.sendMail({
      from: serverEnv.SMTP_FROM,
      to: params.to,
      subject: params.subject,
      html: await render(params.react),
    });
    log.debug(`✅ Email sent: ${params.subject}`);
    return { success: true, id: info.messageId };
  } catch (error) {
    log.error(`❌ Failed to send email "${params.subject}":`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export function sendLookoutCompletionEmail(params: {
  to: string;
  chatTitle: string;
  assistantResponse: string;
  chatId: string;
}) {
  return sendEmail({
    to: params.to,
    subject: `Lookout Complete: ${params.chatTitle}`,
    react: SearchCompletedEmail({
      chatTitle: params.chatTitle,
      assistantResponse: params.assistantResponse,
      chatId: params.chatId,
    }),
  });
}

export function sendVerificationEmail(params: { to: string; url: string }) {
  return sendEmail({
    to: params.to,
    subject: 'Verify your email for Zetora',
    react: VerifyEmailTemplate({ url: params.url }),
  });
}

export function sendTwoFactorOTPEmail(params: { to: string; otp: string }) {
  return sendEmail({
    to: params.to,
    subject: `${params.otp} is your Zetora sign-in code`,
    react: TwoFactorOtpEmailTemplate({ otp: params.otp }),
  });
}
