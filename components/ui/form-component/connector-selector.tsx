import React, { useState, useCallback, useEffect } from 'react';
import { ComprehensiveUserData } from '@/hooks/use-user-data';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { ConnectIcon } from '@hugeicons/core-free-icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/use-mobile';
import { CONNECTOR_CONFIGS, CONNECTOR_ICONS, type ConnectorProvider } from '@/lib/connectors';
import { useQuery } from '@tanstack/react-query';
import { listUserConnectorsAction } from '@/app/actions';
import { useWebHaptics } from 'web-haptics/react';

interface ConnectorSelectorProps {
  selectedConnectors: ConnectorProvider[];
  onConnectorToggle: (provider: ConnectorProvider) => void;
  user: ComprehensiveUserData | null;
}

// Connector Selector Component
export const ConnectorSelector: React.FC<ConnectorSelectorProps> = React.memo(
  ({ selectedConnectors, onConnectorToggle, user }) => {
    const [open, setOpen] = useState(false);
    const isMobile = useIsMobile();
    const haptics = useWebHaptics();

    const { data: connectorsData } = useQuery({
      queryKey: ['connectors', user?.id],
      queryFn: listUserConnectorsAction,
      enabled: !!user,
      staleTime: 1000 * 60 * 2,
    });

    const connectedProviders = connectorsData?.connections?.map((conn) => conn.provider) || [];
    const availableConnectors = Object.entries(CONNECTOR_CONFIGS).filter(([provider]) =>
      connectedProviders.includes(provider as ConnectorProvider),
    );

    const selectedCount = selectedConnectors.length;
    const isSingleConnector = availableConnectors.length === 1;

    React.useEffect(() => {
      if (selectedCount === 0 && availableConnectors.length > 0) {
        availableConnectors.forEach(([provider]) => {
          onConnectorToggle(provider as ConnectorProvider);
        });
      }
    }, [selectedCount, availableConnectors, onConnectorToggle]);

    // Hooks must run unconditionally — declare before the early return below.
    const handleOpenChange = useCallback(
      (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) haptics.trigger('light');
      },
      [haptics],
    );

    if (availableConnectors.length === 0) return null;

    const handleToggle = (provider: ConnectorProvider) => {
      if (isSingleConnector && selectedConnectors.includes(provider)) return;
      haptics.trigger('selection');
      onConnectorToggle(provider);
    };

    const connectorItems = availableConnectors.map(([provider, config]) => {
      const IconComponent = CONNECTOR_ICONS[config.icon];
      const isChecked = selectedConnectors.includes(provider as ConnectorProvider);
      const isDisabled = isSingleConnector && isChecked;
      return (
        <div
          key={provider}
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent transition-colors"
        >
          {IconComponent && <IconComponent className="size-4 shrink-0" />}
          <span className="flex-1 text-[13px]">{config.name}</span>
          <Switch
            checked={isChecked}
            onCheckedChange={() => handleToggle(provider as ConnectorProvider)}
            disabled={isDisabled}
            className="scale-75 origin-right"
          />
        </div>
      );
    });

    if (isMobile) {
      return (
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerTrigger asChild>
            <button className="flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-primary/8 text-primary/80 text-[12px] font-medium hover:bg-primary/12 hover:text-primary transition-colors">
              <HugeiconsIcon icon={ConnectIcon} size={14} color="currentColor" strokeWidth={1.5} />
              <span>Connectors</span>
              <span className="text-primary/50">
                {selectedCount}/{availableConnectors.length}
              </span>
            </button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[60vh]">
            <DrawerHeader className="text-left pb-1">
              <DrawerTitle className="text-sm">Select Connectors</DrawerTitle>
            </DrawerHeader>
            <div className="px-1 pb-4">{connectorItems}</div>
          </DrawerContent>
        </Drawer>
      );
    }

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-primary/8 text-primary/80 text-[12px] font-medium hover:bg-primary/12 hover:text-primary transition-colors">
            <HugeiconsIcon icon={ConnectIcon} size={14} color="currentColor" strokeWidth={1.5} />
            <span>Connectors</span>
            <span className="text-primary/50">
              {selectedCount}/{availableConnectors.length}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-52 p-1 font-sans rounded-lg bg-popover border shadow-lg"
          align="start"
          side="bottom"
          sideOffset={6}
        >
          {connectorItems}
        </PopoverContent>
      </Popover>
    );
  },
);

ConnectorSelector.displayName = 'ConnectorSelector';
