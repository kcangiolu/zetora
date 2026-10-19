'use client';

import { cn } from '@/lib/utils';
import type { HermesCommand } from '@/lib/hermes/commands';

// Telegram-style command menu: filtered, clickable, inserts the command token rather than
// switching pipelines (a Hermes command targets the already-active Hermes conversation —
// see handleHermesCommandSelect in form-component.tsx, which inserts `/name ` and does
// NOT call handleGroupSelect).
export function HermesCommandMenu({
  commands,
  highlightIndex,
  onSelect,
  onHighlight,
}: {
  commands: HermesCommand[];
  highlightIndex: number;
  onSelect: (command: HermesCommand) => void;
  onHighlight: (index: number) => void;
}) {
  if (commands.length === 0) {
    return <p className="px-2 py-2 text-[12px] text-muted-foreground/70">No matching commands</p>;
  }

  return (
    <>
      {commands.map((command, index) => (
        <button
          key={command.name}
          data-at-index={index}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(command);
          }}
          onMouseEnter={() => onHighlight(index)}
          className={cn(
            'flex items-baseline gap-2 w-full px-2 py-1.5 rounded-lg text-left transition-colors duration-100',
            index === highlightIndex ? 'bg-accent/80' : 'bg-transparent',
          )}
        >
          <span className="text-[13px] font-medium text-foreground shrink-0">/{command.name}</span>
          <span className="text-[12px] text-muted-foreground truncate">{command.description}</span>
        </button>
      ))}
    </>
  );
}
