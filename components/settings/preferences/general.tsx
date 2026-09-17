'use client';

import type { SettingsUser } from '../shared';
import { SystemPromptSection } from './system-prompt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThemeSwitcher } from '../../theme-switcher';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { getCustomInstructions, saveCustomInstructions, deleteCustomInstructionsAction } from '@/app/actions';
import { useQuery } from '@tanstack/react-query';
import { sileo } from 'sileo';
import { TrashIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { X, AlertCircle, Trash2, Save, Loader2, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';

export function GeneralTab({
  user,
  isCustomInstructionsEnabled,
  setIsCustomInstructionsEnabledAction,
}: {
  user: SettingsUser;
  isCustomInstructionsEnabled?: boolean;
  setIsCustomInstructionsEnabledAction?: (value: boolean | ((val: boolean) => boolean)) => void;
}) {
  const [locationMetadataEnabled, setLocationMetadataEnabled] = useSyncedPreferences<boolean>(
    'zetora-location-metadata-enabled',
    false,
  );

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
  const [scrollToLatestOnOpen, setScrollToLatestOnOpen] = useSyncedPreferences<boolean>(
    'zetora-scroll-to-latest-on-open',
    false,
  );

  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const enabled = isCustomInstructionsEnabled ?? true;
  const setEnabled = setIsCustomInstructionsEnabledAction ?? (() => {});

  // Custom Instructions queries and handlers
  const {
    data: customInstructions,
    isLoading: customInstructionsLoading,
    refetch,
  } = useQuery({
    queryKey: ['customInstructions', user?.id],
    queryFn: () => getCustomInstructions(user),
    enabled: !!user,
  });

  useEffect(() => {
    if (customInstructions?.content) {
      setContent(customInstructions.content);
    }
  }, [customInstructions]);

  const handleSave = async () => {
    if (!content.trim()) {
      sileo.error({
        title: 'Please enter some instructions',
        description: 'Custom instructions cannot be empty',
        icon: <AlertCircle className="h-4 w-4" />,
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveCustomInstructions(content);
      if (result.success) {
        sileo.success({
          title: 'Custom instructions saved successfully',
          description: 'Your preferences have been updated',
          icon: <Save className="h-4 w-4" />,
        });
        refetch();
      } else {
        sileo.error({
          title: result.error || 'Failed to save instructions',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to save instructions',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      const result = await deleteCustomInstructionsAction();
      if (result.success) {
        sileo.success({
          title: 'Custom instructions deleted successfully',
          description: 'Your custom instructions have been removed',
          icon: <Trash2 className="h-4 w-4" />,
        });
        setContent('');
        refetch();
      } else {
        sileo.error({
          title: result.error || 'Failed to delete instructions',
          description: 'Please try again',
          icon: <X className="h-4 w-4" />,
        });
      }
    } catch (error) {
      sileo.error({
        title: 'Failed to delete instructions',
        description: 'Please try again',
        icon: <X className="h-4 w-4" />,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
        {/* Theme */}
        <div className="flex items-center justify-between py-3.5 gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted-foreground mt-0.5">Choose a theme for the app</p>
          </div>
          <ThemeSwitcher />
        </div>

        {/* Custom Instructions toggle */}
        <div className="flex items-center justify-between py-3.5 gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium">Custom Instructions</p>
            <p className="text-xs text-muted-foreground mt-0.5">Personalise how the AI responds to you</p>
          </div>
          <Switch id="enable-instructions" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Custom Instructions editor - inline expand */}
        {enabled && (
          <div className="py-3.5 space-y-2.5">
            {customInstructionsLoading ? (
              <Skeleton className="h-20 w-full rounded-lg" />
            ) : (
              <Textarea
                id="instructions"
                placeholder="e.g. 'Always provide code examples' or 'Keep responses concise and practical'"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[80px] resize-y text-sm rounded-lg border-border/60"
                style={{ maxHeight: '25dvh' }}
                onFocus={(e) => {
                  try {
                    e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                  } catch {}
                }}
                disabled={isSaving}
              />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !content.trim() || customInstructionsLoading}
                size="sm"
                className="h-7 text-xs rounded-lg px-3"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    Saving
                  </>
                ) : (
                  <>
                    <FloppyDiskIcon className="w-3 h-3 mr-1.5" />
                    Save
                  </>
                )}
              </Button>
              {customInstructions && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={isSaving || customInstructionsLoading}
                  size="sm"
                  className="h-7 px-2 rounded-lg"
                >
                  <TrashIcon className="w-3 h-3" />
                </Button>
              )}
              {customInstructions && !customInstructionsLoading && (
                <span className="text-[11px] text-muted-foreground/50 ml-auto">
                  Updated {new Date(customInstructions.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Location Metadata toggle */}
        <div className="flex items-center justify-between py-3.5 gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium">Location Metadata</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Include approximate location for location-aware answers
            </p>
          </div>
          <Switch
            id="location-metadata"
            checked={locationMetadataEnabled}
            onCheckedChange={setLocationMetadataEnabled}
          />
        </div>

        {/* Anonymization layer */}
        <div className="flex items-center justify-between py-3.5 gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Anonymization
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mask names, companies, and other PII (regex + NER) before sending anything to cloud providers or search
              tools. Applies to all built-in providers; custom providers use their own toggle above.
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
                  If off (recommended), cloud requests are blocked when the PII detector is unreachable instead of
                  risking cleartext leaking through
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

        <div className="flex items-center justify-between py-3.5 gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium">Scroll to Latest Turn</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Jump to the newest messages when opening existing chats
            </p>
          </div>
          <Switch
            id="scroll-to-latest-on-open"
            checked={scrollToLatestOnOpen}
            onCheckedChange={setScrollToLatestOnOpen}
          />
        </div>
      </div>

      <SystemPromptSection />
    </div>
  );
}
