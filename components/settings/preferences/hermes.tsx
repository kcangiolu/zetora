'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { InformationCircleIcon } from '@hugeicons/core-free-icons';
import { Copy, Check, Loader2, X, Bell } from 'lucide-react';
import { sileo } from 'sileo';
import { cn } from '@/lib/utils';
import {
  createHermesEnrollmentAction,
  getHermesConnectorStatusAction,
  revokeHermesConnectorAction,
} from '@/app/actions';
import { usePushSubscription } from '@/hooks/use-push-subscription';
import type { SettingsUser } from '../shared';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { useLocale } from '@/contexts/locale-context';

export function HermesTab({ user }: { user: SettingsUser }) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [enrollCommand, setEnrollCommand] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const { copied, copy } = useCopyToClipboard();
  const [isSendingTest, setIsSendingTest] = useState(false);

  const {
    data: statusData,
    isLoading: isStatusLoading,
    isError: isStatusError,
  } = useQuery({
    queryKey: ['hermesConnectorStatus', user?.id],
    queryFn: () => getHermesConnectorStatusAction(),
    enabled: !!user,
    // The settings tab and the chat's mode-availability check (form-component/use-mode-options.ts)
    // share this exact query key so enrolling here makes the Hermes mode appear there
    // without a manual refetch — refetchInterval keeps this tab's own badge live too.
    refetchInterval: 5000,
  });

  const push = usePushSubscription();

  const connector = statusData?.connector ?? null;

  const handleGenerateEnrollment = async () => {
    setIsGenerating(true);
    try {
      const result = await createHermesEnrollmentAction();
      if (!result.success) {
        sileo.error({ title: result.error, icon: <X className="h-4 w-4" /> });
        return;
      }
      setEnrollCommand(result.enrollCommand);
      queryClient.invalidateQueries({ queryKey: ['hermesConnectorStatus'] });
    } catch {
      sileo.error({ title: 'Failed to start enrollment', description: 'Please try again' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!enrollCommand) return;
    await copy(enrollCommand, 'Command copied to clipboard');
  };

  const handleRevoke = async () => {
    setIsRevoking(true);
    try {
      const result = await revokeHermesConnectorAction();
      if (!result.success) {
        sileo.error({ title: result.error, icon: <X className="h-4 w-4" /> });
        return;
      }
      setEnrollCommand(null);
      queryClient.invalidateQueries({ queryKey: ['hermesConnectorStatus'] });
      sileo.success({ title: 'Hermes connector disconnected' });
    } catch {
      sileo.error({ title: 'Failed to disconnect', description: 'Please try again' });
    } finally {
      setIsRevoking(false);
    }
  };

  const handleTogglePush = async (checked: boolean) => {
    try {
      if (checked) {
        await push.subscribe();
        sileo.success({ title: 'Notifications enabled' });
      } else {
        await push.unsubscribe();
        sileo.success({ title: 'Notifications disabled' });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to update notifications',
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  const handleSendTest = async () => {
    setIsSendingTest(true);
    try {
      await push.sendTest();
      sileo.success({
        title: 'Test notification sent',
        description:
          'Nothing showed up? Check that your browser is allowed to show notifications in your system settings and that Do Not Disturb is off.',
      });
    } catch (error) {
      sileo.error({
        title: 'Failed to send test notification',
        description: error instanceof Error ? error.message : 'Please try again',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const pushDescription = {
    supported: "Get notified when Hermes replies and Zetora isn't open",
    'ios-needs-install':
      'On iPhone and iPad, add Zetora to your Home Screen (Share → Add to Home Screen), then enable notifications from there',
    unsupported: 'Not supported in this browser',
  }[push.support];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-base">Hermes</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Connect your own Hermes Agent (
          <a
            href="https://hermes-agent.nousresearch.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            NousResearch/hermes-agent
          </a>
          ) — a persistent agent you run yourself — as a chat mode in Zetora.
        </p>
      </div>

      <Alert className="border-primary/20 bg-primary/5 rounded-xl">
        <HugeiconsIcon icon={InformationCircleIcon} className="h-4 w-4 text-primary" />
        <AlertTitle className="text-foreground text-sm">Experimental</AlertTitle>
        <AlertDescription className="text-muted-foreground text-xs">
          Hermes&apos;s relay protocol is still evolving on their side — this connector may need updates as it changes.
        </AlertDescription>
      </Alert>

      <div className="border border-border/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h4 className="font-medium text-sm">Connection</h4>
            {isStatusLoading ? (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 bg-muted animate-pulse rounded-full" />
                <span className="text-xs text-muted-foreground">Checking...</span>
              </div>
            ) : connector?.status === 'enrolled' ? (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-xs text-green-600 dark:text-green-400">
                  Connected{connector.gatewaySecretPrefix ? ` · ${connector.gatewaySecretPrefix}…` : ''}
                </span>
                {connector.lastConnectedAt && (
                  <span className="text-xs text-muted-foreground">
                    · last seen {new Date(connector.lastConnectedAt).toLocaleString(locale)}
                  </span>
                )}
              </div>
            ) : isStatusError ? (
              // Distinct from "Not connected": the status couldn't be read, which must not
              // look like the user never enrolled.
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 bg-amber-500 rounded-full" />
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Couldn&apos;t check connection status — retrying
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 bg-muted-foreground/30 rounded-full" />
                <span className="text-xs text-muted-foreground">Not connected</span>
              </div>
            )}
          </div>

          {connector?.status === 'enrolled' ? (
            <Button variant="outline" size="sm" onClick={handleRevoke} disabled={isRevoking} className="h-8">
              {isRevoking ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={handleGenerateEnrollment} disabled={isGenerating} className="h-8">
              {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {enrollCommand ? 'Regenerate command' : 'Connect'}
            </Button>
          )}
        </div>

        {enrollCommand && connector?.status !== 'enrolled' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Run this on the machine where your Hermes Agent gateway lives (expires in 15 minutes):
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-2.5">
              <code className="flex-1 text-[11px] font-mono break-all">{enrollCommand}</code>
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'shrink-0 flex items-center justify-center size-7 rounded-md transition-colors',
                  'hover:bg-muted text-muted-foreground',
                )}
                aria-label="Copy command"
              >
                {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="border border-border/60 rounded-xl p-4">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Notifications
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{pushDescription}</p>
          </div>
          <Switch
            id="hermes-push-notifications"
            checked={push.isSubscribed}
            disabled={!push.isSupported || push.isLoading}
            onCheckedChange={handleTogglePush}
          />
        </div>
        {push.isSubscribed && (
          <Button variant="outline" size="sm" onClick={handleSendTest} disabled={isSendingTest} className="h-8 mt-3">
            {isSendingTest ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Send test notification
          </Button>
        )}
      </div>
    </div>
  );
}
