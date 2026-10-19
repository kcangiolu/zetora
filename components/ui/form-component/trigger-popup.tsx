'use client';

import React, { Fragment } from 'react';
import { CheckIcon, Ghost } from 'lucide-react';

import { FlexibleIcon } from '@/components/ui/flexible-icon';
import type { HermesCommand } from '@/lib/hermes/commands';
import { cn, type SearchGroup, type SearchGroupId } from '@/lib/utils';

import { HermesCommandMenu } from './hermes-command-menu';
import type { TriggerChar } from './trigger-text';

// Within '/', these force an existing skill for one message rather than swapping the
// whole pipeline, so they are listed as Skills apart from the Modes.
const SKILL_MODE_IDS = new Set<string>(['deep-research', 'extreme-search']);

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
      {children}
    </p>
  );
}

function OptionRow({
  index,
  isHighlighted,
  isActive,
  icon,
  label,
  disabled,
  onSelect,
  onHighlight,
}: {
  index: number;
  isHighlighted: boolean;
  isActive: boolean;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
  onHighlight: (index: number) => void;
}) {
  return (
    <button
      data-at-index={index}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={() => onHighlight(index)}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-left transition-colors duration-100',
        isHighlighted ? 'bg-accent/80' : 'bg-transparent',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center size-7 rounded-md shrink-0',
          isActive ? 'bg-primary/10 text-primary' : 'bg-muted/80 text-muted-foreground',
        )}
      >
        {icon}
      </div>
      <span className="flex-1 text-[13px] font-medium text-foreground truncate">{label}</span>
      {isActive && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-medium text-primary/70">Active</span>
          <CheckIcon className="size-3 text-primary" />
        </div>
      )}
    </button>
  );
}

// Above the input when there is room, below it otherwise.
function popupPlacement(): React.CSSProperties {
  const form = typeof document !== 'undefined' ? document.querySelector('[data-form-container]') : null;
  if (!form || form.getBoundingClientRect().top > window.innerHeight / 2) return { bottom: '100%', marginBottom: 8 };
  return { top: '100%', marginTop: 8 };
}

// The popup '@' (sources) and '/' (skills, modes, or the Agent's commands) open.
export function TriggerPopup({
  trigger,
  groups,
  hermesCommands,
  showTemporaryRow,
  highlightIndex,
  onHighlight,
  selectedGroup,
  isTemporaryChat,
  isTemporaryChatLocked,
  onSelectGroup,
  onSelectCommand,
  onSelectTemporary,
  scrollRef,
}: {
  trigger: TriggerChar;
  groups: SearchGroup[];
  // Set while an Agent chat is active: '/' then lists the Agent's own commands.
  hermesCommands: HermesCommand[] | null;
  showTemporaryRow: boolean;
  highlightIndex: number;
  onHighlight: (index: number) => void;
  selectedGroup: SearchGroupId;
  isTemporaryChat: boolean;
  isTemporaryChatLocked: boolean;
  onSelectGroup: (group: SearchGroup) => void;
  onSelectCommand: (command: HermesCommand) => void;
  onSelectTemporary: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  // Skills always sort before modes, so each header goes before the first of its kind.
  const firstSkillIndex = trigger === '/' ? groups.findIndex((g) => SKILL_MODE_IDS.has(g.id)) : -1;
  const firstModeIndex = trigger === '/' ? groups.findIndex((g) => !SKILL_MODE_IDS.has(g.id)) : -1;

  return (
    <div
      className="absolute left-0 w-[280px] rounded-xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-none overflow-hidden z-100"
      style={popupPlacement()}
    >
      {(trigger !== '/' || hermesCommands) && (
        <div className="px-3 pt-2.5 pb-1">
          <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
            {hermesCommands ? 'Commands' : 'Sources'}
          </p>
        </div>
      )}
      <div ref={scrollRef} className="px-1 pb-1 max-h-[260px] overflow-y-auto scrollbar-thin">
        {hermesCommands ? (
          <HermesCommandMenu
            commands={hermesCommands}
            highlightIndex={highlightIndex}
            onSelect={onSelectCommand}
            onHighlight={onHighlight}
          />
        ) : (
          groups.map((group, index) => (
            <Fragment key={group.id}>
              {index === firstSkillIndex && <SectionLabel>Skills</SectionLabel>}
              {index === firstModeIndex && (
                <>
                  {firstSkillIndex !== -1 && <div className="my-1 mx-2 border-t border-border/30" />}
                  <SectionLabel>Modes</SectionLabel>
                </>
              )}
              <OptionRow
                index={index}
                isHighlighted={index === highlightIndex}
                isActive={selectedGroup === group.id}
                icon={<FlexibleIcon icon={group.icon} size={16} color="currentColor" strokeWidth={1.8} />}
                label={group.name}
                onSelect={() => onSelectGroup(group)}
                onHighlight={onHighlight}
              />
            </Fragment>
          ))
        )}
        {showTemporaryRow && (
          <>
            {groups.length > 0 && <div className="my-1 mx-2 border-t border-border/30" />}
            <OptionRow
              index={groups.length}
              isHighlighted={highlightIndex === groups.length}
              isActive={isTemporaryChat}
              icon={<Ghost size={16} strokeWidth={1.8} />}
              label={isTemporaryChat ? 'Temporary' : 'Private'}
              disabled={isTemporaryChatLocked}
              onSelect={onSelectTemporary}
              onHighlight={onHighlight}
            />
          </>
        )}
      </div>
    </div>
  );
}
