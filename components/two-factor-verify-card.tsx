'use client';

import { useState } from 'react';
import { parseAsString, useQueryState } from 'nuqs';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Input } from '@/components/ui/input';
import { Loader2, KeyRound } from 'lucide-react';

type Mode = 'code' | 'backup';

export default function TwoFactorVerifyCard() {
  const [redirect] = useQueryState('redirect', parseAsString.withDefault('/'));
  const [methodsParam] = useQueryState('methods', parseAsString.withDefault(''));
  const router = useRouter();

  const methods = methodsParam.split(',').filter(Boolean);
  const hasTotp = methods.includes('totp');
  const hasOtp = methods.includes('otp');

  const [mode, setMode] = useState<Mode>('code');
  const [useEmail, setUseEmail] = useState(!hasTotp && hasOtp);
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);

  async function handleSendOtp() {
    setError('');
    setOtpSending(true);
    try {
      const result = await authClient.twoFactor.sendOtp();
      if (result.error) {
        setError(result.error.message ?? 'Could not send the code');
        return;
      }
      setOtpSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setOtpSending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result =
        mode === 'backup'
          ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
          : useEmail
            ? await authClient.twoFactor.verifyOtp({ code, trustDevice })
            : await authClient.twoFactor.verifyTotp({ code, trustDevice });

      if (result.error) {
        setError(result.error.message ?? 'Invalid code');
        return;
      }
      router.push(redirect);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-6">
          <KeyRound className="w-5 h-5 text-foreground/80" />
        </div>
        <h1 className="text-3xl font-light tracking-tight text-foreground font-be-vietnam-pro mb-3">
          Two-factor verification
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
          {mode === 'backup'
            ? 'Enter one of your backup codes.'
            : useEmail
              ? 'Enter the code sent to your email.'
              : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode !== 'backup' && useEmail && !otpSent ? (
          <button
            type="button"
            onClick={handleSendOtp}
            disabled={otpSending}
            className="w-full h-11 text-sm font-medium bg-foreground text-background rounded-xl hover:bg-foreground/90 active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {otpSending && <Loader2 className="w-4 h-4 animate-spin" />}
            Send code to my email
          </button>
        ) : (
          <>
            <Input
              type="text"
              inputMode={mode === 'backup' ? 'text' : 'numeric'}
              placeholder={mode === 'backup' ? 'XXXXX-XXXXX' : '123456'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              required
              className="h-11 rounded-xl border-border/60 text-center font-mono tracking-widest"
            />

            {mode !== 'backup' && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                  className="rounded border-border/60"
                />
                Trust this device for 30 days
              </label>
            )}

            {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-sm font-medium bg-foreground text-background rounded-xl hover:bg-foreground/90 active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Verify
            </button>
          </>
        )}
      </form>

      <div className="mt-6 text-center space-y-2">
        {mode !== 'backup' && hasTotp && hasOtp && (
          <button
            type="button"
            onClick={() => {
              setUseEmail((v) => !v);
              setOtpSent(false);
              setCode('');
              setError('');
            }}
            className="block w-full text-sm font-medium text-foreground hover:underline underline-offset-4 transition-colors"
          >
            {useEmail ? 'Use authenticator app instead' : 'Email me a code instead'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'backup' ? 'code' : 'backup'));
            setCode('');
            setError('');
          }}
          className="block w-full text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4 transition-colors"
        >
          {mode === 'backup' ? 'Use a code instead' : 'Use a backup code instead'}
        </button>
      </div>
    </div>
  );
}
