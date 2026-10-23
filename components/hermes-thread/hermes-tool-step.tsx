import { createElement } from 'react';
import {
  AlertCircle,
  Ban,
  BookOpen,
  Brain,
  Check,
  FileText,
  Globe,
  Loader2,
  MessageSquareText,
  Search,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatStepDuration } from '@/lib/hermes/thread';
import type { HermesToolStepView } from '@/lib/hermes/tool-steps';

// Hermes has dozens of tools and plugins add more, so the icon comes from what the name
// says the tool does rather than from a list of names.
const TOOL_ICONS: Array<[RegExp, LucideIcon]> = [
  [/terminal|shell|exec|process|code/, SquareTerminal],
  [/search|grep|find/, Search],
  [/web|browser|fetch|url|http/, Globe],
  [/file|read|write|patch|edit/, FileText],
  [/skill/, BookOpen],
  [/memory/, Brain],
];

function toolIcon(toolName: string): LucideIcon {
  return TOOL_ICONS.find(([pattern]) => pattern.test(toolName))?.[1] ?? Wrench;
}

const STATUS_LABELS: Record<HermesToolStepView['status'], string> = {
  running: 'Running',
  ok: 'Done',
  error: 'Failed',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

function StepStatusIcon({ status }: { status: HermesToolStepView['status'] }) {
  const label = STATUS_LABELS[status];
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label={label} />;
    case 'ok':
      return <Check className="size-3.5 shrink-0 text-primary" aria-label={label} />;
    case 'error':
      return <AlertCircle className="size-3.5 shrink-0 text-destructive" aria-label={label} />;
    case 'blocked':
    case 'cancelled':
      return <Ban className="size-3.5 shrink-0 text-muted-foreground" aria-label={label} />;
  }
}

// A command can be far wider than the screen: it scrolls sideways instead of wrapping or
// being cut, and the right edge fades while more is hidden there. The end padding lets the
// last characters scroll clear of the fade.
const SCROLLING_PREVIEW =
  'overflow-x-auto pr-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/20 [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]';

// One tool call of the agent. Compact while the turn runs (the preview on one line);
// `detailed` in an expanded task, where the full preview gets its own block and keeps
// its line breaks.
export function HermesToolStep({ step, detailed = false }: { step: HermesToolStepView; detailed?: boolean }) {
  const isUnfinished = step.status !== 'running' && step.status !== 'ok';

  return (
    <div className={cn('flex flex-col gap-1.5', detailed && 'py-2.5')}>
      <div className="flex min-h-8 items-center gap-2.5 text-xs">
        {createElement(toolIcon(step.toolName), {
          className: 'size-3.5 shrink-0 text-muted-foreground',
          'aria-hidden': true,
        })}
        <span className="font-mono text-foreground">{step.toolName}</span>
        {detailed && isUnfinished && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              step.status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
            )}
          >
            {STATUS_LABELS[step.status]}
          </span>
        )}
        <span className={cn('min-w-0 flex-1 whitespace-nowrap font-mono text-muted-foreground', SCROLLING_PREVIEW)}>
          {!detailed && step.preview}
        </span>
        {step.durationMs !== null && (
          <span className="tabular-nums text-muted-foreground">{formatStepDuration(step.durationMs)}</span>
        )}
        <StepStatusIcon status={step.status} />
      </div>
      {detailed && step.preview && (
        <pre className="ml-6 rounded-lg border border-border bg-background py-2 pl-2.5 font-mono text-xs text-foreground/85">
          <code className={cn('block whitespace-pre', SCROLLING_PREVIEW)}>{step.preview}</code>
        </pre>
      )}
    </div>
  );
}

// What the agent said on its way to the next tool call, shown among the steps it explains.
export function HermesToolNote({ text, detailed = false }: { text: string; detailed?: boolean }) {
  return (
    <div className={cn('flex min-h-8 items-start gap-2.5 py-2 text-xs text-muted-foreground', detailed && 'py-2.5')}>
      <MessageSquareText className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 wrap-break-word">{text}</p>
    </div>
  );
}
