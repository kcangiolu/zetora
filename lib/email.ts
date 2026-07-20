import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { serverEnv } from '@/env/server';
import SearchCompletedEmail from '@/components/emails/lookout-completed';
import VerifyEmailTemplate from '@/components/emails/verify-email';
import TwoFactorOtpEmailTemplate from '@/components/emails/two-factor-otp';
import { render } from '@react-email/render';

import { createLogger } from '@/lib/logger';

const log = createLogger('email');

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

// Real Resend API keys always start with "re_". Env files across this repo use
// inconsistent dummy values ('placeholder', 'placeholder_resend_key', 'your_resend_api_key_here'),
// so matching against one exact literal let a dummy value slip through as "configured".
function isRealResendKey(key: string | undefined): key is string {
  return !!key && key.startsWith('re_');
}

function resolveEmailProvider(userPreference?: 'resend' | 'smtp'): EmailProvider {
  // 1. Explicit user preference takes priority
  if (userPreference === 'smtp') {
    if (serverEnv.SMTP_HOST && serverEnv.SMTP_USER && serverEnv.SMTP_PASS) {
      return 'smtp';
    }
    log.warn('SMTP configured as preference but SMTP env vars are missing, falling back');
  }
  if (userPreference === 'resend') {
    if (isRealResendKey(serverEnv.RESEND_API_KEY)) {
      return 'resend';
    }
    log.warn('Resend configured as preference but RESEND_API_KEY is missing, falling back');
  }

  // 2. Otherwise, auto-detect
  if (serverEnv.SMTP_HOST && serverEnv.SMTP_USER && serverEnv.SMTP_PASS) {
    if (!isRealResendKey(serverEnv.RESEND_API_KEY)) {
      return 'smtp';
    }
  }
  if (isRealResendKey(serverEnv.RESEND_API_KEY)) {
    return 'resend';
  }
  if (serverEnv.SMTP_HOST) {
    return 'smtp';
  }
  return 'resend';
}

function getFromAddress(provider: EmailProvider): string {
  if (provider === 'smtp') {
    if (!serverEnv.SMTP_FROM) {
      throw new Error('SMTP_FROM is not configured');
    }
    return serverEnv.SMTP_FROM;
  }
  if (!serverEnv.RESEND_FROM) {
    throw new Error('RESEND_FROM is not configured');
  }
  return serverEnv.RESEND_FROM;
}

async function sendViaResend(params: SendEmailParams) {
  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: getFromAddress('resend'),
    to: [params.to],
    subject: params.subject,
    react: params.react,
  });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
  return data;
}

async function sendViaSmtp(params: SendEmailParams) {
  const transporter = getSmtpTransporter();
  if (!transporter) {
    throw new Error('SMTP transporter not configured');
  }
  const html = await render(params.react);
  return transporter.sendMail({
    from: getFromAddress('smtp'),
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
    log.debug(
      `✅ Lookout completion email sent successfully via ${provider}:`,
      'id' in data ? data.id : (data as any).messageId,
    );
    return { success: true, id: 'id' in data ? data.id : (data as any).messageId };
  } catch (error) {
    log.error(`❌ Failed to send lookout completion email via ${provider}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function sendVerificationEmail(params: { to: string; url: string; emailProvider?: 'resend' | 'smtp' }) {
  const provider = resolveEmailProvider(params.emailProvider);
  const sendFn = provider === 'smtp' ? sendViaSmtp : sendViaResend;

  try {
    const data = await sendFn({
      to: params.to,
      subject: 'Verify your email for Zetora',
      react: VerifyEmailTemplate({ url: params.url }),
    });
    log.debug(`✅ Verification email sent successfully via ${provider}`);
    return { success: true, id: 'id' in data ? data.id : (data as any).messageId };
  } catch (error) {
    log.error(`❌ Failed to send verification email via ${provider}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function sendTwoFactorOTPEmail(params: { to: string; otp: string; emailProvider?: 'resend' | 'smtp' }) {
  const provider = resolveEmailProvider(params.emailProvider);
  const sendFn = provider === 'smtp' ? sendViaSmtp : sendViaResend;

  try {
    const data = await sendFn({
      to: params.to,
      subject: `${params.otp} is your Zetora sign-in code`,
      react: TwoFactorOtpEmailTemplate({ otp: params.otp }),
    });
    log.debug(`✅ Two-factor OTP email sent successfully via ${provider}`);
    return { success: true, id: 'id' in data ? data.id : (data as any).messageId };
  } catch (error) {
    log.error(`❌ Failed to send two-factor OTP email via ${provider}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
