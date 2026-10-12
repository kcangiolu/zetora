'use client';

import type { SettingsUser } from '../shared';
import { Tabs as KumoTabs } from '@cloudflare/kumo';
import { useState, useEffect } from 'react';
import { type CustomProviderConfig } from './shared';
import { CustomizeTab } from './customize';
import { GeneralTab } from './general';
import { VoiceTab } from './voice';
import { SearchTab } from './search';
import { IntegrationsTab } from './integrations';
import { AiModelsTab } from './ai-models';
import { HermesTab } from './hermes';
import { isHermesEnabled } from '@/lib/hermes/enabled';

// Hides the whole tab (not just the connect flow inside it) when the deployment build
// didn't enable Hermes.
const HERMES_ENV_ENABLED = isHermesEnabled();

export function PreferencesSection({
  user,
  isCustomInstructionsEnabled,
  setIsCustomInstructionsEnabledAction,
}: {
  user: SettingsUser;
  isCustomInstructionsEnabled?: boolean;
  setIsCustomInstructionsEnabledAction?: (value: boolean | ((val: boolean) => boolean)) => void;
}) {
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
        {preferencesTab === 'search' && <SearchTab customProviders={customProviders} />}

        {/* ── Integrations tab ── */}
        {preferencesTab === 'integrations' && <IntegrationsTab />}

        {/* ── Voice & Media tab ── */}
        {preferencesTab === 'voice' && <VoiceTab customProviders={customProviders} />}

        {/* ── AI Models tab ── */}
        {preferencesTab === 'ai-models' && (
          <AiModelsTab customProviders={customProviders} setCustomProviders={setCustomProviders} />
        )}

        {/* ── Customize tab ── */}
        {preferencesTab === 'customize' && <CustomizeTab />}

        {/* ── Hermes tab ── */}
        {HERMES_ENV_ENABLED && preferencesTab === 'hermes' && <HermesTab user={user} />}
      </div>
    </div>
  );
}
