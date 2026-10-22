'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Ghost, Mic, Plus } from 'lucide-react';
import { GlobalSearchIcon, DocumentAttachmentIcon } from '@hugeicons/core-free-icons';

import { AppsIcon } from '@/components/icons/apps-icon';
import { Checkbox } from '@/components/ui/checkbox';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { FlexibleIcon } from '@/components/ui/flexible-icon';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type SearchGroupId } from '@/lib/search/search-groups';

import type { ModeOptions } from './use-mode-options';

const triggerClassName = (open: boolean) =>
  cn(
    'flex items-center justify-center size-8 rounded-full',
    'border border-foreground/25 text-foreground/70 bg-foreground/12',
    'hover:bg-foreground/18 hover:text-foreground hover:border-foreground/35 transition-colors',
    open && 'bg-foreground/18 text-foreground border-foreground/35',
  );

function ActiveBadge() {
  return <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">Active</span>;
}

// One row of the menu. The desktop popover explains each row in a tooltip; the mobile
// drawer has no hover, so no tooltip.
function MenuRow({
  isMobile,
  tooltip,
  active,
  disabled,
  onClick,
  children,
}: {
  isMobile: boolean;
  tooltip?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const row = (
    <button
      className={cn(
        'w-full flex items-center gap-2.5 text-left hover:bg-accent transition-colors',
        isMobile ? 'px-3 py-2 rounded-lg' : 'px-2.5 py-1.5 rounded-md',
        active && 'bg-accent',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
  if (isMobile || !tooltip) return row;
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="max-w-48 py-1.5 px-2.5">
        <span className="text-[10px] leading-snug">{tooltip}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function SourcesSubmenu({
  isMobile,
  sources,
  searchGroups,
}: { isMobile: boolean } & Pick<ModeOptions, 'sources' | 'searchGroups'>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(true);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (el) setCanScroll(el.scrollHeight - el.scrollTop - el.clientHeight >= 12);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [measure, sources.listedIds]);

  const rows = sources.listedIds.map((id) => {
    const group = searchGroups.find((g) => g.id === id);
    if (!group) return null;
    return (
      <label
        key={id}
        className={cn(
          'w-full flex items-center gap-2.5 hover:bg-accent transition-colors cursor-pointer',
          isMobile ? 'px-2 py-1.5 rounded-lg' : 'px-2.5 py-1.5 rounded-md',
        )}
      >
        <FlexibleIcon icon={group.icon} size={14} color="currentColor" strokeWidth={1.5} />
        <span className={cn('flex-1', isMobile ? 'text-[12px]' : 'text-[13px]')}>{group.name}</span>
        <Checkbox checked={sources.isEnabled(id)} onCheckedChange={() => sources.toggle(id)} />
      </label>
    );
  });

  if (isMobile) return <div className="pl-3 pr-1 py-1 space-y-0.5 max-h-56 overflow-y-auto">{rows}</div>;
  return (
    <div className="relative">
      <div ref={scrollRef} onScroll={measure} className="max-h-32 overflow-y-auto pl-2">
        {rows}
      </div>
      {canScroll && (
        <div className="pointer-events-none absolute bottom-0 inset-x-0 flex justify-center pb-0.5 pt-4 bg-linear-to-t from-popover via-popover/80 to-transparent rounded-b-lg">
          <ChevronDown className="size-3.5 text-muted-foreground animate-bounce" />
        </div>
      )}
    </div>
  );
}

// The composer's "+" menu: uploads, the exclusive modes, temporary chat and sources.
// A drawer on mobile, a popover elsewhere.
export function PlusMenu({
  isMobile,
  open,
  onOpenChange,
  options,
  selectedGroup,
  isSignedIn,
  showTemporaryToggle,
  isTemporaryChat,
  isTemporaryChatLocked,
  uploadHint,
  onUpload,
  onToggleMode,
  onToggleTemporary,
  onContinueByVoice,
}: {
  isMobile: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: ModeOptions;
  selectedGroup: SearchGroupId;
  isSignedIn: boolean;
  showTemporaryToggle: boolean;
  isTemporaryChat: boolean;
  isTemporaryChatLocked: boolean;
  uploadHint: string;
  onUpload: () => void;
  onToggleMode: (modeId: 'mcp' | 'canvas' | 'hermes') => void;
  onToggleTemporary: () => void;
  // Opens the Voice page on this chat; the row is hidden when unset.
  onContinueByVoice?: () => void;
}) {
  const { searchGroups, sources } = options;
  const groupIcon = (id: SearchGroupId) => (
    <FlexibleIcon icon={searchGroups.find((g) => g.id === id)!.icon} size={16} color="currentColor" strokeWidth={1.5} />
  );
  const shortcut = (keys: string) =>
    isMobile ? (
      <span className="text-[9px] text-muted-foreground ml-auto hidden sm:block">{keys}</span>
    ) : (
      <Kbd className="text-[9px] h-4 min-w-4 px-1">{keys}</Kbd>
    );

  const items = (
    <>
      <MenuRow isMobile={isMobile} tooltip={uploadHint} onClick={onUpload}>
        <HugeiconsIcon icon={DocumentAttachmentIcon} size={16} color="currentColor" strokeWidth={1.5} />
        <span className="flex-1 text-[13px]">Upload files or images</span>
        {!isMobile && shortcut('⌘U')}
      </MenuRow>

      {isSignedIn && options.mcpEnabled && (
        <MenuRow
          isMobile={isMobile}
          tooltip="Use tools from your connected apps"
          active={selectedGroup === 'mcp'}
          onClick={() => onToggleMode('mcp')}
        >
          <AppsIcon width={16} height={16} />
          <span className="flex-1 text-[13px]">Apps</span>
          {selectedGroup === 'mcp' && <ActiveBadge />}
        </MenuRow>
      )}
      {isSignedIn && options.canvasEnabled && (
        <MenuRow
          isMobile={isMobile}
          tooltip="Research and generate interactive dashboards"
          active={selectedGroup === 'canvas'}
          onClick={() => onToggleMode('canvas')}
        >
          {groupIcon('canvas')}
          <span className="flex-1 text-[13px]">Canvas</span>
          {selectedGroup === 'canvas' && <ActiveBadge />}
        </MenuRow>
      )}
      {isSignedIn && options.hermesSelectableForChat && (
        <MenuRow
          isMobile={isMobile}
          tooltip="Talk to your own Hermes Agent"
          active={selectedGroup === 'hermes'}
          onClick={() => onToggleMode('hermes')}
        >
          {groupIcon('hermes')}
          <span className="flex-1 text-[13px]">Agent</span>
          {selectedGroup === 'hermes' && <ActiveBadge />}
        </MenuRow>
      )}
      {onContinueByVoice && (
        <MenuRow isMobile={isMobile} tooltip="Keep talking on the Voice page" onClick={onContinueByVoice}>
          <Mic size={16} className="shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <span className="flex-1 text-[13px]">Continue by voice</span>
        </MenuRow>
      )}
      {showTemporaryToggle && (
        <MenuRow
          isMobile={isMobile}
          tooltip={
            isTemporaryChat
              ? "This session won't be saved to history"
              : 'Toggle to prevent this session from being saved'
          }
          active={isTemporaryChat}
          disabled={isTemporaryChatLocked}
          onClick={onToggleTemporary}
        >
          <Ghost
            size={16}
            className={cn('shrink-0', isTemporaryChat ? 'text-primary' : 'text-muted-foreground')}
            strokeWidth={1.5}
          />
          <span className="flex-1 text-[13px]">{isTemporaryChat ? 'Temporary' : 'Private'}</span>
          {isTemporaryChat && <ActiveBadge />}
          {shortcut('⌘⇧J')}
        </MenuRow>
      )}

      <div className={cn('mx-2 border-t border-border/40', isMobile ? 'my-1' : 'my-0.5')} />
      <MenuRow isMobile={isMobile} onClick={sources.toggleExpanded}>
        <HugeiconsIcon icon={GlobalSearchIcon} size={16} color="currentColor" strokeWidth={1.5} />
        <span className="flex-1 text-[13px]">Sources</span>
        <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium">
          {sources.count}
        </span>
        <ChevronDown
          className={cn('size-3.5 text-muted-foreground transition-transform', sources.expanded && 'rotate-180')}
        />
      </MenuRow>
      {sources.expanded && <SourcesSubmenu isMobile={isMobile} sources={sources} searchGroups={searchGroups} />}
    </>
  );

  const trigger = (
    <button className={triggerClassName(open)} aria-label="More options">
      <Plus className="size-[18px]" strokeWidth={2} />
    </button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[70vh]">
          <DrawerHeader className="text-left pb-1">
            <DrawerTitle className="text-sm">Options</DrawerTitle>
          </DrawerHeader>
          <div className="px-1 pb-4 max-h-[calc(70vh-80px)] overflow-y-auto">{items}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        </TooltipTrigger>
        {!open && (
          <TooltipContent side="bottom" sideOffset={6} className="border-0 backdrop-blur-xs py-2 px-3 shadow-none!">
            <span className="font-medium text-[11px]">Modes, uploads & more</span>
          </TooltipContent>
        )}
      </Tooltip>
      <PopoverContent
        className="w-64 p-1 font-sans rounded-lg bg-popover border shadow-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        {items}
      </PopoverContent>
    </Popover>
  );
}
