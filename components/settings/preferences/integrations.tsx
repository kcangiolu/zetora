'use client';

import { Switch } from '@/components/ui/switch';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { isCanvasEnabled } from '@/lib/canvas/enabled';
import { EmailTestButton } from './shared';

// Build-time flags, inlined into the bundle: a feature built out can't be
// turned on here, only by rebuilding the image with the flag set to 'true'.
const APPS_BUILT = process.env.NEXT_PUBLIC_MCP_ENABLED === 'true';
const CANVAS_BUILT = isCanvasEnabled();

function NotInBuild({ flag }: { flag: string }) {
  return (
    <p className="text-xs text-destructive mt-1">
      Not included in this build: rebuild the image with {flag}=true to use it.
    </p>
  );
}

export function IntegrationsTab() {
  const [lookoutEnabled, setLookoutEnabled] = useSyncedPreferences<boolean>('zetora-lookout-enabled', true);
  const [voiceEnabled, setVoiceEnabled] = useSyncedPreferences<boolean>('zetora-voice-enabled', true);
  const [appsEnabled, setAppsEnabled] = useSyncedPreferences<boolean>('zetora-apps-enabled', true);
  const [canvasEnabled, setCanvasEnabled] = useSyncedPreferences<boolean>('zetora-canvas-enabled', true);

  return (
    <>
      <div className="mt-4">
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          <div className="py-3.5">
            <EmailTestButton />
          </div>
        </div>
      </div>
      <div className="mt-4">
        {/* Tools */}
        <div className="rounded-xl border border-border/60 mt-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-sm font-medium">Tools</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Show or hide tool shortcuts in the sidebar and chat modes
            </p>
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Lookout</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show the Lookout shortcut in the sidebar</p>
            </div>
            <Switch id="lookout-enabled" checked={lookoutEnabled} onCheckedChange={setLookoutEnabled} />
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Voice</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show the Voice shortcut in the sidebar</p>
            </div>
            <Switch id="voice-enabled" checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Apps</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Show the Apps shortcut in the sidebar and the + menu
              </p>
              {!APPS_BUILT && <NotInBuild flag="NEXT_PUBLIC_MCP_ENABLED" />}
            </div>
            <Switch
              id="apps-enabled"
              checked={APPS_BUILT && appsEnabled}
              disabled={!APPS_BUILT}
              onCheckedChange={setAppsEnabled}
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Canvas</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show Canvas in the + menu</p>
              {!CANVAS_BUILT && <NotInBuild flag="NEXT_PUBLIC_CANVAS_ENABLED" />}
            </div>
            <Switch
              id="canvas-enabled"
              checked={CANVAS_BUILT && canvasEnabled}
              disabled={!CANVAS_BUILT}
              onCheckedChange={setCanvasEnabled}
            />
          </div>
        </div>
      </div>
    </>
  );
}
