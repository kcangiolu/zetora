import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { serverEnv } from '@/env/server';
import SearchCompletedEmail from '@/components/emails/lookout-completed';
import TestEmailTemplate from '@/components/emails/test-email';
import { render } from '@react-email/render';

type EmailProvider = 'resend' | 'smtp';

interface SendEmailParams {
  to: string;
  subject: string;
  react: React.ReactElement;
}

let resendClient: Resend | null = null;
let smtpTransporter: Transporter | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(serverEnv.RESEND_API_KEY);
  }
  return resendClient;
}

function getSmtpTransporter(): Transporter | null {
  if (!serverEnv.SMTP_HOST || !serverEnv.SMTP_USER || !serverEnv.SMTP_PASS) {
    return null;
  }
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: serverEnv.SMTP_HOST,
      port: serverEnv.SMTP_PORT,
      secure: serverEnv.SMTP_SECURE,
      auth: {
        user: serverEnv.SMTP_USER,
        pass: serverEnv.SMTP_PASS,
      },
    });
  }
  return smtpTransporter;
}

function resolveEmailProvider(userPreference?: 'resend' | 'smtp'): EmailProvider {
  // 1. Explicit user preference takes priority
  if (userPreference === 'smtp') {
    if (serverEnv.SMTP_HOST && serverEnv.SMTP_USER && serverEnv.SMTP_PASS) {
      return 'smtp';
    }
    console.warn('SMTP configured as preference but SMTP env vars are missing, falling back');
  }
  if (userPreference === 'resend') {
    if (serverEnv.RESEND_API_KEY && serverEnv.RESEND_API_KEY !== 'placeholder') {
      return 'resend';
    }
    console.warn('Resend configured as preference but RESEND_API_KEY is missing, falling back');
  }

  // 2. Otherwise, auto-detect
  if (serverEnv.SMTP_HOST && serverEnv.SMTP_USER && serverEnv.SMTP_PASS) {
    if (!serverEnv.RESEND_API_KEY || serverEnv.RESEND_API_KEY === 'placeholder') {
      return 'smtp';
    }
  }
  if (serverEnv.RESEND_API_KEY && serverEnv.RESEND_API_KEY !== 'placeholder') {
    return 'resend';
  }
  if (serverEnv.SMTP_HOST) {
    return 'smtp';
  }
  return 'resend';
}

function getFromAddress(): string {
  const provider = resolveEmailProvider();
  if (provider === 'smtp') {
    return serverEnv.SMTP_FROM || 'Zetora AI <noreply@zetora.ai>';
  }
  return 'Zetora AI <noreply@zetora.ai>';
}

async function sendViaResend(params: SendEmailParams) {
  const resend = getResendClient();
  return resend.emails.send({
    from: getFromAddress(),
    to: [params.to],
    subject: params.subject,
    react: params.react,
  });
}

async function sendViaSmtp(params: SendEmailParams) {
  const transporter = getSmtpTransporter();
  if (!transporter) {
    throw new Error('SMTP transporter not configured');
  }
  const html = await render(params.react);
  return transporter.sendMail({
    from: getFromAddress(),
    to: params.to,
    subject: params.subject,
    html,
  });
}

interface SendLookoutCompletionEmailParams {
  to: string;
  chatTitle: string;
  assistantResponse: string;
  chatId: string;
  emailProvider?: 'resend' | 'smtp';
}

export async function sendLookoutCompletionEmail({
  to,
  chatTitle,
  assistantResponse,
  chatId,
  emailProvider,
}: SendLookoutCompletionEmailParams) {
  const provider = resolveEmailProvider(emailProvider);
  const sendFn = provider === 'smtp' ? sendViaSmtp : sendViaResend;

  try {
    const data = await sendFn({
      to,
      subject: `Lookout Complete: ${chatTitle}`,
      react: SearchCompletedEmail({
        chatTitle,
        assistantResponse,
        chatId,
      }),
    });
    console.log(
      `✅ Lookout completion email sent successfully via ${provider}:`,
      'id' in data ? data.id : (data as any).messageId,
    );
    return { success: true, id: 'id' in data ? data.id : (data as any).messageId };
  } catch (error) {
    console.error(`❌ Failed to send lookout completion email via ${provider}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function sendTestEmail(params: { to: string; emailProvider?: 'resend' | 'smtp' }) {
  const provider = resolveEmailProvider(params.emailProvider);
  const sendFn = provider === 'smtp' ? sendViaSmtp : sendViaResend;

  try {
    const data = await sendFn({
      to: params.to,
      subject: 'Zetora — Email Configuration Test',
      react: TestEmailTemplate(),
    });
    console.log(`✅ Test email sent successfully via ${provider}`);
    return { success: true, id: 'id' in data ? data.id : (data as any).messageId };
  } catch (error) {
    console.error(`❌ Test email failed via ${provider}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
