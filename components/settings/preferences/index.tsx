'use client';

import type { SettingsUser } from '../shared';
import { Tabs as KumoTabs } from '@cloudflare/kumo';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type Model } from '@/ai/models';
import { type CustomProviderConfig } from './shared';
import { CustomizeTab } from './customize';
import { GeneralTab } from './general';
import { VoiceTab } from './voice';
import { SearchTab } from './search';
import { IntegrationsTab } from './integrations';
import { AiModelsTab } from './ai-models';
import { HermesTab } from './hermes';

// Same master switch as components/ui/form-component/index.tsx's hermesEnvEnabled —
// hides the whole tab (not just the connect flow inside it) when the deployment build
// didn't enable Hermes. Inlined at build time, see lib/hermes/feature-flag.ts.
const HERMES_ENV_ENABLED = process.env.NEXT_PUBLIC_HERMES_ENABLED !== 'false';

export function PreferencesSection({
  user,
  isCustomInstructionsEnabled,
  setIsCustomInstructionsEnabledAction,
}: {
  user: SettingsUser;
  isCustomInstructionsEnabled?: boolean;
  setIsCustomInstructionsEnabledAction?: (value: boolean | ((val: boolean) => boolean)) => void;
}) {
  // Fetch custom models for the tertiary model selectors
  const { data: customModelsData } = useQuery({
    queryKey: ['customModels'],
    queryFn: async () => {
      const res = await fetch('/api/custom-providers/models');
      if (!res.ok) return { models: [] };
      return res.json() as Promise<{ models: Model[] }>;
    },
    staleTime: 60_000,
  });
  const customModelsList: Model[] = customModelsData?.models ?? [];

  // Custom AI Providers state
  const [customProviders, setCustomProviders] = useState<CustomProviderConfig[]>([]);

  useEffect(() => {
    fetch('/api/custom-providers')
      .then((r) => r.json())
      .then((d) => setCustomProviders(d.providers || []))
      .catch(() => {});
  }, []);

  const [preferencesTab, setPreferencesTab] = useState<
    'general' | 'search' | 'ai-models' | 'voice' | 'integrations' | 'customize' | 'hermes'
  >('general');

  return (
    <div>
      <div>
        <KumoTabs
          variant="segmented"
          value={preferencesTab}
          onValueChange={(v) =>
            setPreferencesTab(
              v as 'general' | 'search' | 'ai-models' | 'voice' | 'integrations' | 'customize' | 'hermes',
            )
          }
          className="w-full [--color-kumo-tint:var(--accent)] [--color-kumo-base:var(--background)] [--color-kumo-recessed:var(--muted)] [--color-kumo-surface:var(--card)] [--text-color-kumo-default:var(--foreground)] [--text-color-kumo-strong:var(--muted-foreground)] [--text-color-kumo-subtle:var(--muted-foreground)] [--color-kumo-ring:var(--border)]"
          listClassName="w-full overflow-x-auto [&>button]:shrink-0 [&>button]:justify-center md:[&>button]:flex-1"
          tabs={[
            { value: 'general', label: 'General' },
            { value: 'search', label: 'Search' },
            { value: 'ai-models', label: 'AI Models' },
            { value: 'voice', label: 'Voice & Media' },
            { value: 'integrations', label: 'Integrations' },
            { value: 'customize', label: 'Customize' },
            ...(HERMES_ENV_ENABLED ? [{ value: 'hermes', label: 'Hermes' }] : []),
          ]}
        />

        {/* ── General tab ── */}
        {preferencesTab === 'general' && (
          <GeneralTab
            user={user}
            isCustomInstructionsEnabled={isCustomInstructionsEnabled}
            setIsCustomInstructionsEnabledAction={setIsCustomInstructionsEnabledAction}
          />
        )}

        {/* ── Search & Retrieval tab ── */}
        {preferencesTab === 'search' && (
          <SearchTab user={user} customModelsList={customModelsList} customProviders={customProviders} />
        )}

        {/* ── Integrations tab ── */}
        {preferencesTab === 'integrations' && (
          <IntegrationsTab user={user} customModelsList={customModelsList} customProviders={customProviders} />
        )}

        {/* ── Voice & Media tab ── */}
        {preferencesTab === 'voice' && <VoiceTab customProviders={customProviders} />}

        {/* ── AI Models tab ── */}
        {preferencesTab === 'ai-models' && (
          <AiModelsTab
            user={user}
            customModelsList={customModelsList}
            customProviders={customProviders}
            setCustomProviders={setCustomProviders}
          />
        )}

        {/* ── Customize tab ── */}
        {preferencesTab === 'customize' && <CustomizeTab />}

        {/* ── Hermes tab ── */}
        {HERMES_ENV_ENABLED && preferencesTab === 'hermes' && <HermesTab user={user} />}
      </div>
    </div>
  );
}
