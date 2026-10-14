'use client';

import type { SettingsUser } from '../shared';
import { SystemPromptSection } from './system-prompt';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ThemeSwitcher } from '../../theme-switcher';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';
import { getCustomInstructions, saveCustomInstructions, deleteCustomInstructionsAction } from '@/app/actions';
import { useQuery } from '@tanstack/react-query';
import { sileo } from 'sileo';
import { TrashIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { X, AlertCircle, Trash2, Save, Loader2 } from 'lucide-react';
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
    queryFn: () => getCustomInstructions(),
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
