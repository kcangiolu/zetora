import React from 'react';
import { ZetoraLogo } from './logos/zetora-logo';

export const ZetoraLogoHeader = () => (
  <div className="flex items-center gap-2 my-1.5">
    <ZetoraLogo className="size-6.5" />
    <h2 className="text-xl font-normal font-be-vietnam-pro text-foreground dark:text-foreground">Zetora</h2>
  </div>
);
