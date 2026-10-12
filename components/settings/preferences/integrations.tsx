'use client';

import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { sileo } from 'sileo';
import { HardDrive, Timer } from 'lucide-react';
import { storageProviders, lockoutProviders, emailProviders, EmailTestButton } from './shared';

// Build-time flags, inlined into the bundle: a feature built out can't be
// turned on here, only by rebuilding the image with the flag set to 'true'.
const APPS_BUILT = process.env.NEXT_PUBLIC_MCP_ENABLED === 'true';
const CANVAS_BUILT = process.env.NEXT_PUBLIC_CANVAS_ENABLED === 'true';

function NotInBuild({ flag }: { flag: string }) {
  return (
    <p className="text-xs text-destructive mt-1">
      Not included in this build: rebuild the image with {flag}=true to use it.
    </p>
  );
}

export function IntegrationsTab() {
  const [sandboxProvider, setSandboxProvider] = useSyncedPreferences<'daytona' | 'docker'>(
    'zetora-sandbox-provider',
    'daytona',
  );

  const [storageProvider, setStorageProvider] = useSyncedPreferences<'cloudflare-r2' | 'minio'>(
    'zetora-storage-provider',
    'cloudflare-r2',
  );

  const [emailProvider, setEmailProvider] = useSyncedPreferences<'resend' | 'smtp'>('zetora-email-provider', 'resend');

  const [lockoutProvider, setLockoutProvider] = useSyncedPreferences<'qstash' | 'bullmq'>(
    'zetora-lockout-provider',
    'qstash',
  );

  const [xqlEnabled, setXqlEnabled] = useSyncedPreferences<boolean>('zetora-xql-enabled', true);
  const [lookoutEnabled, setLookoutEnabled] = useSyncedPreferences<boolean>('zetora-lookout-enabled', true);
  const [voiceEnabled, setVoiceEnabled] = useSyncedPreferences<boolean>('zetora-voice-enabled', true);
  const [appsEnabled, setAppsEnabled] = useSyncedPreferences<boolean>('zetora-apps-enabled', true);
  const [swarmEnabled, setSwarmEnabled] = useSyncedPreferences<boolean>('zetora-swarm-enabled', true);
  const [connectorsEnabled, setConnectorsEnabled] = useSyncedPreferences<boolean>('zetora-connectors-enabled', true);
  const [canvasEnabled, setCanvasEnabled] = useSyncedPreferences<boolean>('zetora-canvas-enabled', true);

  const handleStorageProviderChange = (newProvider: 'cloudflare-r2' | 'minio') => {
    setStorageProvider(newProvider);
    sileo.success({
      title: `Storage provider changed to ${newProvider === 'cloudflare-r2' ? 'Cloudflare R2' : 'MinIO'}`,
      description: 'This will be used for all file uploads and artifact storage',
      icon: <HardDrive className="h-4 w-4" />,
    });
  };

  const handleLockoutProviderChange = (newProvider: 'qstash' | 'bullmq') => {
    setLockoutProvider(newProvider);
    const label = lockoutProviders.find((p) => p.value === newProvider)?.label ?? newProvider;
    sileo.success({
      title: `Lookout scheduler changed to ${label}`,
      description: 'This will be used for all future scheduled searches',
      icon: <Timer className="h-4 w-4" />,
    });
  };

  return (
    <>
      <div className="mt-4">
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          {/* Sandbox Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Sandbox Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">Environment used to execute Python code</p>
            </div>
            <Select value={sandboxProvider} onValueChange={(v) => setSandboxProvider(v as 'daytona' | 'docker')}>
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daytona">Daytona (Cloud)</SelectItem>
                <SelectItem value="docker">Docker (Local)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Storage Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Storage Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">Object storage for uploads and artifacts</p>
            </div>
            <Select value={storageProvider} onValueChange={(v) => handleStorageProviderChange(v as any)}>
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {storageProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center gap-2">
                      <span>{p.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
          {/* Lookout Scheduling Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Lookout Scheduler</p>
              <p className="text-xs text-muted-foreground mt-0.5">Scheduling backend for automated searches</p>
            </div>
            <Select
              value={lockoutProvider}
              onValueChange={(v) => handleLockoutProviderChange(v as 'qstash' | 'bullmq')}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lockoutProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span>{p.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Email Provider */}
          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Email Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">How lookout completion emails are sent</p>
            </div>
            <Select value={emailProvider} onValueChange={(v) => setEmailProvider(v as 'resend' | 'smtp')}>
              <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {emailProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span>{p.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
              <p className="text-sm font-medium">XQL (Beta)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show the X/Twitter search shortcut in the sidebar</p>
            </div>
            <Switch id="xql-enabled" checked={xqlEnabled} onCheckedChange={setXqlEnabled} />
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
              <p className="text-sm font-medium">Swarm mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show Swarm mode in the + menu</p>
            </div>
            <Switch id="swarm-enabled" checked={swarmEnabled} onCheckedChange={setSwarmEnabled} />
          </div>

          <div className="flex items-center justify-between px-4 py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Connectors</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show Connectors in the + menu</p>
            </div>
            <Switch id="connectors-enabled" checked={connectorsEnabled} onCheckedChange={setConnectorsEnabled} />
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
