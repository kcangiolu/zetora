import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// No backdrop-blur: up to eight of these mount per answer and each would re-composite
// what scrolls behind it every frame.
export const actionIconButtonClassName =
  'h-8 w-8 rounded-sm border border-border bg-background/60 text-muted-foreground shadow-none transition-colors hover:bg-accent/60 hover:text-foreground';

export function ActionTooltip({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
