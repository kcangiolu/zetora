import React from 'react';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { Chart03Icon } from '@hugeicons/core-free-icons';
import { Spinner } from '../ui/spinner';
import { pseudoRandom } from '@/lib/utils';

export function IconArrowInbox(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M20.25 14.75V17.25C20.25 18.9069 18.9069 20.25 17.25 20.25H6.75C5.09315 20.25 3.75 18.9069 3.75 17.25V14.75M12 15V3.75M12 15L8.5 11.5M12 15L15.5 11.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function isToolPartType(partType: string) {
  return partType.startsWith('tool-') || partType === 'dynamic-tool';
}

export function isSourcePartType(partType: string) {
  return partType === 'source-url';
}

export function CopyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M7.75 7.75V6.75C7.75 5.09315 9.09315 3.75 10.75 3.75H17.25C18.9069 3.75 20.25 5.09315 20.25 6.75V13.26C20.25 14.9169 18.9069 16.26 17.25 16.26H16.25M3.75 10.75V17.25C3.75 18.9069 5.09315 20.25 6.75 20.25H13.25C14.9069 20.25 16.25 18.9069 16.25 17.25V10.75C16.25 9.09315 14.9069 7.75 13.25 7.75H6.75C5.09315 7.75 3.75 9.09315 3.75 10.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TryAgainIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M10.75 1.5L14.25 4.75L10.75 8M13.25 16L9.75 19.25L13.25 22.5M10.75 19.25H14C18.0041 19.25 21.25 16.0041 21.25 12C21.25 9.81504 20.2834 7.85583 18.7546 6.52661M13.25 4.75H10C5.99593 4.75 2.75 7.99594 2.75 12C2.75 14.1854 3.71696 16.145 5.24638 17.4742"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Loading state for stock chart — mirrors the real accordion header + chart + flat rows layout
export const StockChartLoader = ({ title, input }: { title?: string; input?: any }) => {
  const companies = input?.companies || [];
  return (
    <div className="w-full mt-4 rounded-xl border border-border/60 overflow-hidden bg-card/30">
      {/* Header — matches AccordionTrigger layout */}
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-md bg-primary/10">
            <HugeiconsIcon icon={Chart03Icon} className="size-3.5 text-primary animate-pulse" strokeWidth={2} />
          </div>
          <div className="flex flex-col items-start gap-0.5 min-w-0">
            <span className="font-pixel text-[10px] text-muted-foreground/50 uppercase tracking-wider">
              Stock Analysis
            </span>
            <span className="text-xs font-medium text-foreground/80 truncate max-w-[280px]">
              {title || 'Preparing financial analysis...'}
            </span>
          </div>
        </div>
        <Spinner className="size-4 text-primary/60" />
      </div>

      {/* Content — matches p-4 space-y-4 body */}
      <div className="p-4 space-y-4">
        {/* Interval skeleton */}
        <div className="flex items-center gap-2">
          <div className="h-3 w-14 rounded bg-muted/30 animate-pulse" />
          <span className="text-[9px] text-muted-foreground/30">/</span>
          <div className="h-3 w-16 rounded bg-muted/25 animate-pulse" />
        </div>

        {/* Chart skeleton — matches h-56 md:h-72 */}
        <div className="w-full h-56 md:h-72 rounded-lg border border-border/40 bg-muted/10 flex items-end p-4 gap-1">
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-primary/6 animate-pulse"
              style={{
                height: `${(20 + Math.sin(i * 0.5) * 30 + pseudoRandom(i) * 25).toFixed(2)}%`,
                animationDelay: `${i * 40}ms`,
              }}
            />
          ))}
        </div>

        {/* Stock rows skeleton — matches flat divided rows */}
        {companies.length > 0 && (
          <div className="rounded-lg border border-border/40 divide-y divide-border/30 overflow-hidden">
            {companies.slice(0, 6).map((company: string, i: number) => (
              <div key={i} className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-2 h-2 rounded-full bg-muted-foreground/15 animate-pulse"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                  <span className="text-xs font-medium text-muted-foreground/50">{company}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="h-4 w-16 rounded bg-muted/35 animate-pulse"
                    style={{ animationDelay: `${i * 100 + 50}ms` }}
                  />
                  <div
                    className="h-3 w-12 rounded bg-muted/25 animate-pulse"
                    style={{ animationDelay: `${i * 100 + 80}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Intentionally hidden: tool errors are suppressed in the message stream UI.
export const ToolErrorDisplay = (_: { errorText: string; toolName: string }) => null;

const NOTICE_TONES = {
  error: {
    box: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950',
    iconBox: 'bg-red-100 dark:bg-red-900',
    icon: 'text-red-600 dark:text-red-400',
    title: 'text-red-900 dark:text-red-100',
    text: 'text-red-700 dark:text-red-300',
  },
  empty: {
    box: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950',
    iconBox: 'bg-amber-100 dark:bg-amber-900',
    icon: 'text-amber-600 dark:text-amber-400',
    title: 'text-amber-900 dark:text-amber-100',
    text: 'text-amber-700 dark:text-amber-300',
  },
};

// A tool result that failed or found nothing.
export function ToolNotice({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: keyof typeof NOTICE_TONES;
  icon: React.ElementType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  const colors = NOTICE_TONES[tone];
  return (
    <div className={`w-full my-4 rounded-lg border ${colors.box}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-8 h-8 rounded-lg ${colors.iconBox} flex items-center justify-center`}>
            <Icon className={`h-4 w-4 ${colors.icon}`} />
          </div>
          <div className="flex-1">
            <h3 className={`text-sm font-medium ${colors.title}`}>{title}</h3>
            <p className={`text-xs mt-1 ${colors.text}`}>{children}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatDynamicToolName(partType: string, dynamicToolName?: string) {
  const normalizedName =
    partType === 'dynamic-tool' ? dynamicToolName || 'dynamic_tool' : partType.replace(/^tool-/, '');
  if (normalizedName.startsWith('mcp_')) {
    // Strip mcp_<server_slug>_ prefix, keep just the tool name
    const withoutMcp = normalizedName.replace(/^mcp_[^_]+_/, '');
    return withoutMcp.replace(/_/g, ' ');
  }
  return normalizedName.replace(/_/g, ' ');
}

export function getDynamicStepState(part: any): 'loading' | 'done' | 'error' {
  if (part.state === 'output-error') return 'error';
  if (part.state === 'output-available') return 'done';
  return 'loading';
}

function getDynamicOutputText(output: any): string | null {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (typeof output?.text === 'string') return output.text;

  if (Array.isArray(output?.content)) {
    const textParts = output.content
      .map((contentPart: any) => {
        if (typeof contentPart === 'string') return contentPart;
        if (contentPart?.type === 'text' && typeof contentPart?.text === 'string') return contentPart.text;
        return null;
      })
      .filter((value: string | null): value is string => Boolean(value));

    if (textParts.length > 0) {
      return textParts.join('\n\n');
    }
  }

  return null;
}
