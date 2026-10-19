import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UseChatHelpers } from '@ai-sdk/react';
import { CaretDownIcon } from '@phosphor-icons/react/dist/ssr';
import { useWebHaptics } from 'web-haptics/react';

import { AUTO_MODEL_ID, DEFAULT_MODEL_ALIAS, findModel, supportsCanvasMode, type Model } from '@/ai/models';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Kbd } from '@/components/ui/kbd';
import { MagicWandIcon } from '@/components/ui/magic-wand-icon';
import { MarqueeText } from '@/components/ui/marquee-text';
import { ModelPickerPanel } from '@/components/ui/model-picker/model-picker-panel';
import { ProviderIcon } from '@/components/ui/model-picker/provider-icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProcessorIcon } from '@/components/ui/processor-icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { useModels } from '@/hooks/use-models';
import { ComprehensiveUserData } from '@/hooks/use-user-data';
import { ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SearchGroupId } from '@/lib/search/search-groups';

// Survives the composer remounting (e.g. moving from a new chat to its page)
// so an open switcher stays open.
let modelSwitcherOpenCache = false;

interface ModelSwitcherProps {
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  className?: string;
  status: UseChatHelpers<ChatMessage>['status'];
  onModelSelect?: (model: Model) => void;
  user?: ComprehensiveUserData | null;
  selectedGroup: SearchGroupId;
  autoRoutedModel?: { model: string; route: string } | null;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

interface SwitcherTriggerProps extends React.ComponentPropsWithoutRef<typeof Button> {
  open: boolean;
  selectedModel: string;
  currentModel: Model | undefined;
  // The model Auto picked for the last message, shown next to the Auto badge.
  autoRoutedModel: Model | undefined;
  autoRoutedModelId: string | undefined;
}

const SwitcherTrigger = React.forwardRef<React.ComponentRef<typeof Button>, SwitcherTriggerProps>(
  ({ open, selectedModel, currentModel, autoRoutedModel, autoRoutedModelId, className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      role="combobox"
      aria-expanded={open}
      size="sm"
      className={cn(
        'flex items-center gap-1.5 px-2.5 h-8 rounded-full',
        'bg-transparent text-foreground',
        'hover:bg-foreground/5! transition-all duration-200',
        'shadow-none',
        className,
      )}
      {...props}
    >
      {/* Mobile: show icon only */}
      <ProcessorIcon size={16} className="sm:hidden block" />

      {/* Desktop: show provider icon + label */}
      {selectedModel === AUTO_MODEL_ID ? (
        <>
          <span className="text-[13px] font-medium sm:hidden">Auto</span>
          {autoRoutedModelId ? (
            <div className="items-center gap-1.5 sm:flex hidden">
              <ProviderIcon provider={autoRoutedModel?.provider ?? 'custom'} size={14} className="text-foreground/70" />
              <span className="text-[13px] font-medium">{autoRoutedModel?.label || autoRoutedModelId}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Auto</span>
            </div>
          ) : (
            <div className="items-center gap-1.5 sm:flex hidden">
              <MagicWandIcon size={14} className="text-foreground/70" />
              <span className="text-[13px] font-medium">Auto</span>
            </div>
          )}
        </>
      ) : (
        <div className="items-center gap-1.5 sm:flex hidden min-w-0 max-w-[200px] overflow-hidden">
          {currentModel && (
            <ProviderIcon provider={currentModel.provider} size={14} className="text-foreground/70 shrink-0" />
          )}
          <MarqueeText text={currentModel?.label ?? ''} className="text-[13px] font-medium min-w-0 flex-1" />
        </div>
      )}
      <CaretDownIcon
        size={14}
        color="currentColor"
        strokeWidth={1.5}
        className={cn('transition-transform duration-200 opacity-50', open && 'rotate-180')}
      />
    </Button>
  ),
);
SwitcherTrigger.displayName = 'SwitcherTrigger';

// The chat's model picker, in the composer.
export const ModelSwitcher: React.FC<ModelSwitcherProps> = React.memo(
  ({
    selectedModel,
    setSelectedModel,
    className,
    onModelSelect,
    user,
    selectedGroup,
    autoRoutedModel,
    inputRef: externalInputRef,
  }) => {
    const { models: availableModels, getModel } = useModels();
    const isMobile = useIsMobile();
    const haptics = useWebHaptics();

    const [open, setOpenState] = useState(() => modelSwitcherOpenCache);
    const setOpen = useCallback((nextOpen: boolean) => {
      modelSwitcherOpenCache = nextOpen;
      setOpenState(nextOpen);
    }, []);

    // ⌘M toggles the switcher.
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
          e.preventDefault();
          setOpen(!modelSwitcherOpenCache);
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [setOpen]);

    // Canvas mode only lists the models that can drive it.
    const pickableModels = useMemo(
      () => (selectedGroup === 'canvas' ? availableModels.filter(supportsCanvasMode) : availableModels),
      [availableModels, selectedGroup],
    );

    // Entering canvas mode with a model that can't drive it switches to the
    // default model, or the first one that can.
    useEffect(() => {
      if (user === undefined || selectedGroup !== 'canvas' || pickableModels.length === 0) return;
      if (pickableModels.some((model) => model.value === selectedModel)) return;
      const defaultModel = getModel(DEFAULT_MODEL_ALIAS);
      const fallback = pickableModels.find((model) => model.value === defaultModel?.value) ?? pickableModels[0];
      setSelectedModel(fallback.value);
    }, [user, selectedGroup, pickableModels, selectedModel, getModel, setSelectedModel]);

    const currentModel = useMemo(() => findModel(availableModels, selectedModel), [availableModels, selectedModel]);

    const handleSelect = useCallback(
      (model: Model) => {
        setSelectedModel(model.value.trim());
        onModelSelect?.(model);
        setOpen(false);
      },
      [setSelectedModel, onModelSelect, setOpen],
    );

    // Refocus the main textarea when the drawer closes.
    const handleDrawerOpenChange = useCallback(
      (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) {
          haptics.trigger('light');
        } else {
          requestAnimationFrame(() => {
            externalInputRef?.current?.focus();
          });
        }
      },
      [externalInputRef, haptics, setOpen],
    );

    const handlePopoverOpenChange = useCallback(
      (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) haptics.trigger('light');
      },
      [haptics, setOpen],
    );

    const panel = (
      <ModelPickerPanel
        models={pickableModels}
        selectedModel={currentModel?.value ?? selectedModel}
        onSelect={handleSelect}
        idPrefix="model"
      />
    );
    const trigger = (
      <SwitcherTrigger
        open={open}
        selectedModel={selectedModel}
        currentModel={currentModel}
        autoRoutedModel={autoRoutedModel ? getModel(autoRoutedModel.model) : undefined}
        autoRoutedModelId={autoRoutedModel?.model}
        className={className}
      />
    );

    return isMobile ? (
      <Drawer open={open} onOpenChange={handleDrawerOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="h-[85vh] flex flex-col">
          <DrawerHeader className="pb-2 shrink-0 p-2">
            <DrawerTitle className="text-left flex items-center gap-2.5 font-medium text-base">
              <div className="p-1.5 rounded-lg bg-secondary/50">
                <ProcessorIcon size={18} />
              </div>
              Select Model
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{panel}</div>
        </DrawerContent>
      </Drawer>
    ) : (
      <Popover open={open} onOpenChange={handlePopoverOpenChange}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          {!open && (
            <TooltipContent side="bottom" sideOffset={6} className="border-0 backdrop-blur-xs py-2 px-3 shadow-none!">
              <span className="font-medium text-[11px]">Switch model</span>
              <Kbd className="ml-1.5 h-4 min-w-4 text-[10px]">⌘M</Kbd>
            </TooltipContent>
          )}
        </Tooltip>
        <PopoverContent
          className="w-[90vw] sm:w-[26em] max-w-[26em] h-[300px] p-0 font-sans rounded-lg bg-popover z-40 border border-border/60 shadow-none overflow-hidden"
          align="end"
          side="bottom"
          sideOffset={6}
          avoidCollisions={true}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            externalInputRef?.current?.focus();
          }}
        >
          {panel}
        </PopoverContent>
      </Popover>
    );
  },
);

ModelSwitcher.displayName = 'ModelSwitcher';
