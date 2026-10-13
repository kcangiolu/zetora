'use client';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { Shield } from 'lucide-react';
import { useState, useEffect } from 'react';

export function DataProtectionSection() {
  const [anonymizationEnabled, setAnonymizationEnabled] = useSyncedPreferences<boolean>(
    'zetora-anonymization-enabled',
    false,
  );
  const [anonymizationCustomTerms, setAnonymizationCustomTerms] = useSyncedPreferences<string[]>(
    'zetora-anonymization-custom-terms',
    [],
  );
  const [anonymizationCustomTermsInput, setAnonymizationCustomTermsInput] = useState(
    anonymizationCustomTerms.join(', '),
  );
  useEffect(() => {
    setAnonymizationCustomTermsInput(anonymizationCustomTerms.join(', '));
  }, [anonymizationCustomTerms]);
  const [anonymizationFailOpen, setAnonymizationFailOpen] = useSyncedPreferences<boolean>(
    'zetora-anonymization-fail-open',
    false,
  );
  const [anonymizationNerEnabled, setAnonymizationNerEnabled] = useSyncedPreferences<boolean>(
    'zetora-anonymization-ner-enabled',
    true,
  );
  const [anonymizationLanguage, setAnonymizationLanguage] = useSyncedPreferences<'en' | 'fr'>(
    'zetora-anonymization-language',
    'en',
  );

  return (
    <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
      <div className="flex items-center justify-between py-3.5 gap-6">
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Anonymization
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mask names, companies, and other PII (regex + NER) before sending anything to cloud providers or search
            tools. Applies to all built-in providers; custom providers use their own toggle in Preferences → AI Models.
          </p>
        </div>
        <Switch id="anonymization-enabled" checked={anonymizationEnabled} onCheckedChange={setAnonymizationEnabled} />
      </div>

      {anonymizationEnabled && (
        <>
          <div className="py-3.5 gap-2 flex flex-col">
            <p className="text-sm font-medium">Always mask these terms</p>
            <p className="text-xs text-muted-foreground -mt-1.5">
              Client or project names the detector might miss — comma-separated
            </p>
            <Input
              value={anonymizationCustomTermsInput}
              onChange={(e) => setAnonymizationCustomTermsInput(e.target.value)}
              onBlur={() =>
                setAnonymizationCustomTerms(
                  anonymizationCustomTermsInput
                    .split(',')
                    .map((term) => term.trim())
                    .filter(Boolean),
                )
              }
              placeholder="Acme Corp, Project Nightingale"
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Automatic detection (NER)</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Off masks only the always-mask list and structured patterns (email, phone, IBAN, IP, URL) — public
                entities (e.g. company names) stay in clear text, keeping web search usable.
              </p>
            </div>
            <Switch
              id="anonymization-ner-enabled"
              checked={anonymizationNerEnabled}
              onCheckedChange={setAnonymizationNerEnabled}
            />
          </div>

          {anonymizationNerEnabled && (
            <div className="flex items-center justify-between py-3.5 gap-6">
              <div className="min-w-0">
                <p className="text-sm font-medium">Detection language</p>
                <p className="text-xs text-muted-foreground mt-0.5">Language the NER model expects</p>
              </div>
              <Select value={anonymizationLanguage} onValueChange={(v) => setAnonymizationLanguage(v as 'en' | 'fr')}>
                <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between py-3.5 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Fail open on detector outage</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                If off (recommended), cloud requests are blocked when the PII detector is unreachable instead of risking
                cleartext leaking through
              </p>
            </div>
            <Switch
              id="anonymization-fail-open"
              checked={anonymizationFailOpen}
              onCheckedChange={setAnonymizationFailOpen}
            />
          </div>
        </>
      )}
    </div>
  );
}
