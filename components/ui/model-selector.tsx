'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Cpu } from 'lucide-react';

import { findModel, type Model } from '@/ai/models';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { MarqueeText } from '@/components/ui/marquee-text';
import { ModelPickerPanel } from '@/components/ui/model-picker/model-picker-panel';
import { ProviderIcon } from '@/components/ui/model-picker/provider-icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { useModels } from '@/hooks/use-models';
import { cn } from '@/lib/utils';

interface ModelSelectorDialogProps {
  selectedModel: string;
  onModelSelect: (modelValue: string) => void;
  excludeModels?: string[];
  // 'custom' lists only the user's custom provider models.
  source?: 'all' | 'custom';
  className?: string;
  onClose?: () => void;
}

interface SelectorTriggerProps extends React.ComponentPropsWithoutRef<typeof Button> {
  currentModel: Model | undefined;
  open: boolean;
}

const SelectorTrigger = React.forwardRef<React.ComponentRef<typeof Button>, SelectorTriggerProps>(
  ({ currentModel, open, className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      size="sm"
      className={cn('justify-between h-8 text-xs gap-2 overflow-hidden', className)}
      {...props}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
        {currentModel && (
          <ProviderIcon provider={currentModel.provider} size={13} className="text-foreground/70 shrink-0" />
        )}
        <MarqueeText text={currentModel?.label || 'Select model'} className="min-w-0 flex-1" />
      </div>
      <ChevronDown
        className={cn('h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-200', open && 'rotate-180')}
      />
    </Button>
  ),
);
SelectorTrigger.displayName = 'SelectorTrigger';

// A model picker for settings: a button showing the current model that opens
// the shared model list.
export function ModelSelectorDialog({
  selectedModel,
  onModelSelect,
  excludeModels = [],
  source = 'all',
  className,
  onClose,
}: ModelSelectorDialogProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const { models, customModels } = useModels();
  const idPrefix = `mselector-${React.useId()}`;

  const availableModels = useMemo(
    () => (source === 'custom' ? customModels : models).filter((model) => !excludeModels.includes(model.value)),
    [source, customModels, models, excludeModels],
  );
  const currentModel = useMemo(() => findModel(availableModels, selectedModel), [availableModels, selectedModel]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen && onClose) {
        requestAnimationFrame(() => {
          onClose();
        });
      }
    },
    [onClose],
  );

  const handleSelect = useCallback(
    (model: Model) => {
      onModelSelect(model.value);
      setOpen(false);
    },
    [onModelSelect],
  );

  const panel = (
    <ModelPickerPanel
      models={availableModels}
      selectedModel={currentModel?.value ?? selectedModel}
      onSelect={handleSelect}
      idPrefix={idPrefix}
    />
  );
  const trigger = <SelectorTrigger currentModel={currentModel} open={open} className={className} />;

  return isMobile ? (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="min-h-[70vh] max-h-[85vh] flex flex-col">
        <DrawerHeader className="pb-2 shrink-0">
          <DrawerTitle className="text-left flex items-center gap-2.5 font-medium text-base">
            <div className="p-1.5 rounded-lg bg-secondary/50">
              <Cpu size={18} color="currentColor" />
            </div>
            Select Model
          </DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{panel}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-[26em] max-w-[90vw] h-[340px] p-0 font-sans rounded-xl bg-popover border border-border/60 shadow-lg shadow-black/8 dark:shadow-black/25 overflow-hidden"
        align="start"
        side="bottom"
        sideOffset={6}
        avoidCollisions={true}
        collisionPadding={16}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClose?.();
        }}
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}
