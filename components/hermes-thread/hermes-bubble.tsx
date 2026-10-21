'use client';

import { useRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useWebHaptics } from 'web-haptics/react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';

export interface HermesBubbleAction {
  id: string;
  label: string;
  // Shown under the label in the mobile sheet, where there is room to say what it does.
  description?: string;
  icon: LucideIcon;
  onSelect: () => void;
  // Set apart in the toolbar and drawn quieter: the actions that take something away.
  separated?: boolean;
}

// A click on something inside the bubble that has its own job is not a click on the bubble.
function isOwnControl(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('a, button, input, textarea, select, [role="button"]'));
}

// A message in an Agent conversation. A click or a tap selects it and offers its actions: a
// toolbar under the bubble, or a sheet from the bottom on a phone. A long press stays the
// system's text selection, so part of a message can be copied.
export function HermesBubble({
  from,
  label,
  selected,
  onSelectedChange,
  actions,
  children,
  className,
}: {
  from: 'user' | 'agent';
  // Names the message for assistive technology, e.g. "Your message".
  label: string;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  actions: HermesBubbleAction[];
  children: ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const haptics = useWebHaptics();
  // Read when the press starts: a tap that only dismisses a text selection has already
  // cleared it by the time the click arrives.
  const hadSelectionRef = useRef(false);

  const run = (action: HermesBubbleAction) => {
    onSelectedChange(false);
    action.onSelect();
  };

  const bubble = (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'rounded-[18px] px-4 py-2.5 text-[15px] leading-relaxed wrap-break-word transition-shadow',
        from === 'user'
          ? 'max-w-[85%] self-end rounded-br-md bg-accent sm:max-w-[75%]'
          : 'max-w-full self-start rounded-bl-md border border-border bg-card sm:max-w-[85%]',
        selected &&
          'ring-1 ring-primary ring-offset-0 shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_14%,transparent)]',
        className,
      )}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectedChange(!selected);
        } else if (event.key === 'Escape' && selected) {
          onSelectedChange(false);
        }
      }}
      onPointerDown={() => {
        hadSelectionRef.current = Boolean(window.getSelection()?.toString());
      }}
      onClick={(event) => {
        if (isOwnControl(event.target)) return;
        // Making or dismissing a text selection is not a request for actions.
        if (hadSelectionRef.current || window.getSelection()?.toString()) return;
        if (isMobile) haptics.trigger('light');
        onSelectedChange(!selected);
      }}
    >
      {children}
    </div>
  );

  if (isMobile) {
    return (
      <>
        {bubble}
        <Drawer open={selected} onOpenChange={onSelectedChange}>
          <DrawerContent className="px-3 pb-7">
            <DrawerTitle className="sr-only">Message actions</DrawerTitle>
            <DrawerDescription className="sr-only">{label}</DrawerDescription>
            <div className="mt-3 flex flex-col gap-1">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => run(action)}
                  className="flex min-h-13 items-center gap-3.5 rounded-xl px-3 text-left text-base text-foreground active:bg-accent"
                >
                  <action.icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="flex flex-col gap-0.5">
                    <span>{action.label}</span>
                    {action.description && (
                      <span className="text-[13px] text-muted-foreground">{action.description}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1.5', from === 'user' ? 'items-end' : 'items-start')} data-hermes-bubble>
      {bubble}
      {selected && (
        <div
          role="toolbar"
          aria-label="Message actions"
          className="flex gap-0.5 rounded-xl border border-border bg-popover p-0.5 shadow-lg"
        >
          {actions.map((action) => (
            <span key={action.id} className="flex">
              {action.separated && <span className="mx-0.5 my-1.5 w-px bg-border" aria-hidden="true" />}
              <button
                type="button"
                onClick={() => run(action)}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] hover:bg-accent',
                  action.separated ? 'text-muted-foreground hover:text-foreground' : 'text-foreground',
                )}
              >
                <action.icon className="size-3.5" aria-hidden="true" />
                {action.label}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
