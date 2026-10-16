'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Loader2, ShieldCheck, ShieldOff, Copy, Download, Check } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

type Step = 'idle' | 'password' | 'enroll' | 'disable-password';

interface TwoFactorSettingsProps {
  enabled: boolean;
  isMobile?: boolean;
}

function extractSecret(totpURI: string): string {
  try {
    return new URL(totpURI.replace('otpauth://', 'https://')).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}

export function TwoFactorSettings({ enabled: initialEnabled, isMobile }: TwoFactorSettingsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  const [totpURI, setTotpURI] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    authClient
      .listAccounts()
      .then((result) => {
        setHasPassword(result.data?.some((a) => a.providerId === 'credential') ?? false);
      })
      .catch(() => setHasPassword(false));
  }, []);

  function reset() {
    setStep('idle');
    setPassword('');
    setCode('');
    setError('');
    setLoading(false);
    setTotpURI('');
    setQrDataUrl('');
    setBackupCodes([]);
  }

  async function handleStartEnroll(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authClient.twoFactor.enable({ password, issuer: 'Zetora' });
      if (result.error) {
        setError(result.error.message ?? 'Could not enable two-factor authentication');
        return;
      }
      if (result.data) {
        const { totpURI, backupCodes } = result.data;
        setTotpURI(totpURI);
        setBackupCodes(backupCodes);
        setQrDataUrl(await QRCode.toDataURL(totpURI, { margin: 1, width: 220 }));
        setStep('enroll');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({ code });
      if (result.error) {
        setError(result.error.message ?? 'Invalid code');
        return;
      }
      setEnabled(true);
      reset();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authClient.twoFactor.disable({ password });
      if (result.error) {
        setError(result.error.message ?? 'Could not disable two-factor authentication');
        return;
      }
      setEnabled(false);
      reset();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyBackupCodes() {
    await copy(backupCodes.join('\n'), null);
  }

  function handleDownloadBackupCodes() {
    const blob = new Blob([backupCodes.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zetora-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  const sectionPad = isMobile ? 'p-3' : 'p-4';

  return (
    <div className="rounded-lg border border-border/60 divide-y divide-border/40">
      <div className={cn(sectionPad, 'flex items-center justify-between gap-3')}>
        <div className="flex items-center gap-3 min-w-0">
          {enabled ? (
            <ShieldCheck className="w-4 h-4 text-foreground/70 shrink-0" />
          ) : (
            <ShieldOff className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <Label className="font-pixel text-xs text-muted-foreground/50 uppercase tracking-[0.12em]">
              Two-Factor Authentication
            </Label>
            <p className="text-sm font-medium mt-1">
              {enabled ? 'Enabled — authenticator app or email code' : 'Not enabled'}
            </p>
            {!enabled && hasPassword === false && (
              <p className="text-xs text-muted-foreground mt-1">
                Set a password for your account to enable two-factor authentication.
              </p>
            )}
          </div>
        </div>

        {step === 'idle' && (
          <Button
            type="button"
            variant={enabled ? 'outline' : 'default'}
            size="sm"
            disabled={!enabled && hasPassword !== true}
            title={!enabled && hasPassword === false ? 'Requires a password on your account' : undefined}
            onClick={() => setStep(enabled ? 'disable-password' : 'password')}
          >
            {enabled ? 'Disable' : 'Enable'}
          </Button>
        )}
      </div>

      {step === 'password' && (
        <form onSubmit={handleStartEnroll} className={cn(sectionPad, 'space-y-3')}>
          <p className="text-xs text-muted-foreground">Confirm your password to start setup.</p>
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="h-10 rounded-lg border-border/60"
          />
          {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Continue
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === 'enroll' && (
        <div className={cn(sectionPad, 'space-y-4')}>
          <div>
            <p className="text-xs text-muted-foreground mb-3">
              Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy…).
            </p>
            <div className="flex justify-center bg-white rounded-lg p-3 w-fit mx-auto">
              {qrDataUrl && (
                <img src={qrDataUrl} alt="Authenticator QR code" width={180} height={180} />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-2 break-all font-mono">
              {extractSecret(totpURI)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium mb-2">
              Save your backup codes — each can be used once if you lose access to your authenticator or email.
            </p>
            <div className="grid grid-cols-2 gap-1.5 bg-muted/30 rounded-lg p-3 font-mono text-xs">
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Button type="button" size="sm" variant="outline" onClick={handleCopyBackupCodes}>
                {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleDownloadBackupCodes}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download
              </Button>
            </div>
          </div>

          <form onSubmit={handleConfirmEnroll} className="space-y-3 pt-1 border-t border-border/40">
            <p className="text-xs text-muted-foreground pt-3">
              Enter the 6-digit code from your app to confirm setup.
            </p>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              required
              className="h-10 rounded-lg border-border/60 font-mono tracking-widest"
            />
            {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={loading}>
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Confirm and enable
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {step === 'disable-password' && (
        <form onSubmit={handleDisable} className={cn(sectionPad, 'space-y-3')}>
          <p className="text-xs text-muted-foreground">Confirm your password to disable two-factor authentication.</p>
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="h-10 rounded-lg border-border/60"
          />
          {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="destructive" disabled={loading}>
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Disable
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
