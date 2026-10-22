'use client';

import React from 'react';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { LookoutForm } from './lookout-form';

type LookoutFormDialogProps = React.ComponentProps<typeof LookoutForm> & { isMobile: boolean };

// The create/edit form with the button that opens it: a drawer on mobile, a dialog otherwise.
export function LookoutFormDialog({ isMobile, ...formProps }: LookoutFormDialogProps) {
  const { formHook, canCreateMore } = formProps;
  const title = formHook.editingLookout ? 'Edit Lookout' : 'Create New Lookout';

  if (isMobile) {
    return (
      <Drawer open={formHook.isCreateDialogOpen} onOpenChange={formHook.handleDialogOpenChange}>
        <DrawerTrigger asChild>
          <Button className="flex-1" disabled={!canCreateMore}>
            <HugeiconsIcon icon={PlusSignIcon} size={16} color="currentColor" strokeWidth={1.5} className="mr-2" />
            Add New Lookout
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="pb-4">
            <DrawerTitle className="text-lg">{title}</DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-4 overflow-y-auto flex-1">
            <LookoutForm {...formProps} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={formHook.isCreateDialogOpen} onOpenChange={formHook.handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!canCreateMore}>
          <HugeiconsIcon icon={PlusSignIcon} size={16} color="currentColor" strokeWidth={1.5} className="mr-1" />
          Add new
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>

        <LookoutForm {...formProps} />
      </DialogContent>
    </Dialog>
  );
}
