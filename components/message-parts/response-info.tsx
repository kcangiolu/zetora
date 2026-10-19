import { Clock, Info } from 'lucide-react';
import { ArrowLeftIcon, ArrowRightIcon, SigmaIcon } from '@phosphor-icons/react';
import { CpuIcon, Robot01Icon } from '@hugeicons/core-free-icons';

import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocale } from '@/contexts/locale-context';
import type { ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

import { actionIconButtonClassName } from './action-button';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Pill({ icon, children }: { icon: typeof CpuIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded-lg px-2 py-1">
      <HugeiconsIcon icon={icon} size={12} />
      {children}
    </div>
  );
}

// Model, timing and token counts of an answer. A Hermes reply has no model or token data
// (the relay carries none): it shows where and when it came from instead.
export function ResponseInfo({ message, modelLabel }: { message: ChatMessage; modelLabel: string | null }) {
  const locale = useLocale();
  const meta = message.metadata;
  const inputCount = meta?.inputTokens ?? null;
  const outputCount = meta?.outputTokens ?? null;
  const tokenTotal = (meta?.totalTokens ?? (inputCount ?? 0) + (outputCount ?? 0)) || null;
  const completionTime = meta?.completionTime ?? null;
  const hermesGatewayId = meta?.hermesGatewayId ?? null;
  const hermesReceivedAt =
    hermesGatewayId && meta?.createdAt
      ? new Date(meta.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
      : null;

  if (!modelLabel && completionTime === null && inputCount === null && outputCount === null && !hermesGatewayId) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(actionIconButtonClassName, 'touch-manipulation lg:pointer-events-auto')}
        >
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 max-w-[calc(100vw-2rem)]"
        side="top"
        align="end"
        sideOffset={8}
        alignOffset={-8}
        avoidCollisions={true}
        collisionPadding={16}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            <h4 className="font-semibold text-sm">Response Info</h4>
          </div>

          {hermesGatewayId && (
            <>
              <Row label="Agent">
                <Pill icon={Robot01Icon}>Hermes Agent</Pill>
              </Row>
              <Row label="Gateway">
                <span className="text-xs font-mono truncate">{hermesGatewayId}</span>
              </Row>
              {hermesReceivedAt && (
                <Row label="Received">
                  <span className="text-xs">{hermesReceivedAt}</span>
                </Row>
              )}
            </>
          )}

          {modelLabel && (
            <Row label="Model">
              <Pill icon={CpuIcon}>{modelLabel}</Pill>
            </Row>
          )}

          {completionTime !== null && (
            // For a Hermes reply this is the time from the user's message to the reply's
            // arrival (agent-event/route.ts), not model time.
            <Row label={hermesGatewayId ? 'Response Time' : 'Generation Time'}>
              <div className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {completionTime.toFixed(1)}s
              </div>
            </Row>
          )}

          {(inputCount != null || outputCount != null) && (
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">Token Usage</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {inputCount != null && (
                  <div className="flex items-center justify-between bg-muted rounded-lg px-2 py-1">
                    <span className="flex items-center gap-1">
                      <ArrowLeftIcon weight="regular" className="h-3 w-3" />
                      Input
                    </span>
                    <span className="font-medium">{inputCount.toLocaleString()}</span>
                  </div>
                )}
                {outputCount != null && (
                  <div className="flex items-center justify-between bg-muted rounded-lg px-2 py-1">
                    <span className="flex items-center gap-1">
                      <ArrowRightIcon weight="regular" className="h-3 w-3" />
                      Output
                    </span>
                    <span className="font-medium">{outputCount.toLocaleString()}</span>
                  </div>
                )}
              </div>
              {tokenTotal != null && (
                <div className="flex items-center justify-between bg-accent rounded-lg px-2 py-1 text-xs">
                  <span className="flex items-center gap-1 font-medium">
                    <SigmaIcon className="h-3 w-3" weight="regular" />
                    Total
                  </span>
                  <span className="font-semibold">{tokenTotal.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
