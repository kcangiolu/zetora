'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSyncedPreferences, type SystemPromptPreset } from '@/hooks/use-synced-preferences';
import { getDefaultSystemPrompt } from '@/app/actions';
import { AlertTriangle, Check, RotateCcw, Save, Trash2 } from 'lucide-react';

// Full-override editor for the Auto mode system prompt (lib/search/groups/auto.ts).
// Unlike Custom Instructions (appended on top of the base prompt), a non-empty
// override here REPLACES it entirely — including the tool-calling protocol and
// citation rules baked into the default — so a bad edit can break tool use.
// Only ever affects Auto mode; Canvas/Deep Research/Extreme Search/etc. keep
// their own dedicated instructions untouched.
export function SystemPromptSection() {
  const [override, setOverride] = useSyncedPreferences<string>('zetora-system-prompt-override', '');
  const [presets, setPresets] = useSyncedPreferences<SystemPromptPreset[]>('zetora-system-prompt-presets', []);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [newPresetName, setNewPresetName] = useState('');
  const [justApplied, setJustApplied] = useState(false);

  const { data: defaultPrompt, isLoading: defaultPromptLoading } = useQuery({
    queryKey: ['defaultSystemPrompt'],
    queryFn: getDefaultSystemPrompt,
    staleTime: 5 * 60 * 1000,
  });

  const selectedPreset = presets.find((p) => p.id === selectedPresetId);
  const isActive = override.trim().length > 0;

  return (
    <div className="mt-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] px-4 py-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">System Prompt</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Replaces Zetora&apos;s entire default system prompt for Auto mode — including the tool-calling protocol
                and citation rules. A malformed prompt can break tool use. Other modes (Canvas, Deep Research, Extreme
                Search, …) are unaffected. Leave empty to use the default.
              </p>
            </div>
          </div>
          <span
            className={
              isActive
                ? 'text-[10px] shrink-0 rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium'
                : 'text-[10px] shrink-0 rounded-full px-2 py-0.5 bg-muted text-muted-foreground font-medium'
            }
          >
            {isActive ? 'Custom active' : 'Default active'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px] text-muted-foreground">Override prompt</Label>
          {isActive && (
            <button
              type="button"
              onClick={() => setOverride('')}
              className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 flex items-center gap-1"
            >
              <RotateCcw className="size-2.5" />
              Reset to default
            </button>
          )}
        </div>
        <Textarea
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          placeholder="Leave empty to use the default prompt below…"
          rows={6}
          className="text-xs rounded-md resize-y min-h-24 max-h-72 overflow-y-auto font-mono"
        />

        <details key={defaultPrompt ? 'loaded' : 'loading'} open={!isActive}>
          <summary className="cursor-pointer text-[10px] text-muted-foreground/60 hover:text-foreground select-none">
            Default prompt (for reference — copy from here as a starting point)
          </summary>
          {defaultPromptLoading ? (
            <Skeleton className="mt-1.5 h-24 w-full rounded-md" />
          ) : (
            <pre className="mt-1.5 whitespace-pre-wrap text-[10px] text-muted-foreground/70 bg-muted/30 rounded-md p-2.5 border border-border/40 max-h-72 overflow-y-auto font-mono">
              {defaultPrompt}
            </pre>
          )}
        </details>

        <div className="flex items-center gap-1.5 pt-0.5">
          <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
            <SelectTrigger className="h-7 text-xs rounded-md flex-1">
              <SelectValue placeholder="Load a preset…" />
            </SelectTrigger>
            <SelectContent>
              {presets.length === 0 ? (
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground/60">No presets saved yet</p>
              ) : (
                presets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id} className="text-xs">
                    {preset.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 text-xs shrink-0"
            disabled={!selectedPreset}
            onClick={() => {
              if (!selectedPreset) return;
              setOverride(selectedPreset.prompt);
              setJustApplied(true);
              setTimeout(() => setJustApplied(false), 1500);
            }}
          >
            {justApplied ? (
              <>
                <Check className="size-3 mr-1" />
                Applied
              </>
            ) : (
              'Apply'
            )}
          </Button>
          {selectedPresetId && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => {
                setPresets(presets.filter((p) => p.id !== selectedPresetId));
                setSelectedPresetId('');
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Input
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Preset name…"
            className="h-7 text-xs rounded-md flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs shrink-0"
            disabled={!newPresetName.trim() || !override.trim()}
            onClick={() => {
              const name = newPresetName.trim();
              if (!name) return;
              const existing = presets.find((p) => p.name === name);
              if (existing) {
                setPresets(presets.map((p) => (p.id === existing.id ? { ...p, prompt: override } : p)));
                setSelectedPresetId(existing.id);
              } else {
                const id = crypto.randomUUID();
                setPresets([...presets, { id, name, prompt: override }]);
                setSelectedPresetId(id);
              }
              setNewPresetName('');
            }}
          >
            <Save className="size-3 mr-1" />
            Save as preset
          </Button>
        </div>
      </div>
    </div>
  );
}
