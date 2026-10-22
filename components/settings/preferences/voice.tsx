'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSyncedPreferences, type ImageGenPromptPreset } from '@/hooks/use-synced-preferences';
import {
  IMAGE_GENERATION_DEFAULT_INSTRUCTIONS,
  IMAGE_EDITING_DEFAULT_INSTRUCTIONS,
} from '@/lib/skills/image-prompt-defaults';
import { TTS_PROVIDERS, type TTSProvider, getTTSProviderConfig } from '@/lib/tts-providers';
import { STT_PROVIDERS, type STTProvider, getSTTProviderConfig } from '@/lib/stt-providers';
import {
  VOICE_S2S_BACKENDS,
  type VoiceS2SBackend,
  getVoiceS2SBackendConfig,
  resolveVoiceS2SBackend,
} from '@/lib/s2s-backends';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { useState, useMemo } from 'react';
import { type CustomProviderConfig, ImagePromptPresetEditor } from './shared';
import { useInstanceCapabilities } from '@/hooks/use-instance-capabilities';

export function VoiceTab({ customProviders }: { customProviders: CustomProviderConfig[] }) {
  // Own instance (read-only here) — the Integrations tab owns the toggle;
  // both stay in sync via useSyncedPreferences' CustomEvent.
  const [voiceEnabled] = useSyncedPreferences<boolean>('zetora-voice-enabled', true);
  const [voiceS2SBackendPref, setVoiceS2SBackend] = useSyncedPreferences<VoiceS2SBackend>(
    'zetora-voice-s2s-backend',
    'cloud',
  );
  const capabilities = useInstanceCapabilities();
  const voiceS2SBackend = capabilities ? resolveVoiceS2SBackend(voiceS2SBackendPref, capabilities) : null;
  // A choice only exists when the instance has both backends.
  const offersBackendChoice = capabilities?.cloudVoice === true && capabilities.localVoice;

  const [ttsProvider, setTtsProvider] = useSyncedPreferences<TTSProvider>('zetora-tts-provider', 'elevenlabs');
  const [ttsCustomProviderId, setTtsCustomProviderId] = useSyncedPreferences<string>(
    'zetora-tts-custom-provider-id',
    '',
  );
  const [ttsOpenAIModel, setTtsOpenAIModel] = useSyncedPreferences<string>('zetora-tts-openai-model', 'qwen3-tts');
  const [ttsOpenAIVoice, setTtsOpenAIVoice] = useSyncedPreferences<string>('zetora-tts-openai-voice', 'af_bella');
  const [ttsOpenAILanguage, setTtsOpenAILanguage] = useSyncedPreferences<string>(
    'zetora-tts-openai-language',
    'French',
  );

  const [sttProvider, setSttProvider] = useSyncedPreferences<STTProvider>('zetora-stt-provider', 'elevenlabs');
  const [sttCustomProviderId, setSttCustomProviderId] = useSyncedPreferences<string>(
    'zetora-stt-custom-provider-id',
    '',
  );
  const [sttOpenAIModel, setSttOpenAIModel] = useSyncedPreferences<string>('zetora-stt-openai-model', 'whisper-1');

  const [imageGenCustomProviderId, setImageGenCustomProviderId] = useSyncedPreferences<string>(
    'zetora-image-gen-custom-provider-id',
    '',
  );
  const [imageGenModel, setImageGenModel] = useSyncedPreferences<string>('zetora-image-gen-model', '');
  const [imageGenRequestBody, setImageGenRequestBody] = useSyncedPreferences<string>(
    'zetora-image-gen-request-body',
    '',
  );
  const [imageEditCustomProviderId, setImageEditCustomProviderId] = useSyncedPreferences<string>(
    'zetora-image-edit-custom-provider-id',
    '',
  );
  const [imageEditModel, setImageEditModel] = useSyncedPreferences<string>('zetora-image-edit-model', '');
  const [imageEditRequestBody, setImageEditRequestBody] = useSyncedPreferences<string>(
    'zetora-image-edit-request-body',
    '',
  );

  const [imageGenSystemPrompt, setImageGenSystemPrompt] = useSyncedPreferences<string>(
    'zetora-image-gen-system-prompt',
    '',
  );
  const [imageGenPromptPresets, setImageGenPromptPresets] = useSyncedPreferences<ImageGenPromptPreset[]>(
    'zetora-image-gen-prompt-presets',
    [],
  );
  const [selectedImageGenPresetId, setSelectedImageGenPresetId] = useState('');
  const [newImageGenPresetName, setNewImageGenPresetName] = useState('');

  const [imageEditSystemPrompt, setImageEditSystemPrompt] = useSyncedPreferences<string>(
    'zetora-image-edit-system-prompt',
    '',
  );
  const [imageEditPromptPresets, setImageEditPromptPresets] = useSyncedPreferences<ImageGenPromptPreset[]>(
    'zetora-image-edit-prompt-presets',
    [],
  );
  const [selectedImageEditPresetId, setSelectedImageEditPresetId] = useState('');
  const [newImageEditPresetName, setNewImageEditPresetName] = useState('');

  const imageGenRequestBodyError = useMemo(() => {
    if (!imageGenRequestBody.trim()) return null;
    try {
      JSON.parse(imageGenRequestBody);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [imageGenRequestBody]);
  const imageEditRequestBodyError = useMemo(() => {
    if (!imageEditRequestBody.trim()) return null;
    try {
      JSON.parse(imageEditRequestBody);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [imageEditRequestBody]);

  return (
    <div className="mt-4">
      <div className="rounded-xl border border-border/60 divide-y divide-border/40 px-4">
        {/* ── TTS Provider ── */}
        <div className="flex items-center justify-between py-3.5 gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium">Voice TTS Provider</p>
            <p className="text-xs text-muted-foreground mt-0.5">Engine used for voice synthesis</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-[220px] h-8 text-xs rounded-lg shrink-0 justify-between font-normal"
              >
                {getTTSProviderConfig(ttsProvider)?.label ?? 'ElevenLabs'}
                <ChevronDown className="size-3.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[300px]">
              <DropdownMenuRadioGroup value={ttsProvider} onValueChange={(v) => setTtsProvider(v as TTSProvider)}>
                {TTS_PROVIDERS.map((p) => (
                  <DropdownMenuRadioItem key={p.value} value={p.value} className="text-xs">
                    <div className="flex flex-col">
                      <span className="font-medium">{p.label}</span>
                      <span className="text-[10px] text-muted-foreground">{p.description}</span>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── Custom TTS config ── */}
        {ttsProvider === 'openai-compatible' && (
          <div className="py-3.5 space-y-2.5">
            <p className="text-xs text-muted-foreground font-medium">Custom TTS Server</p>
            {customProviders.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60">
                Add a provider in the <span className="font-medium">Custom AI Providers</span> section first.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Provider</Label>
                  <Select value={ttsCustomProviderId} onValueChange={setTtsCustomProviderId}>
                    <SelectTrigger className="h-7 text-xs rounded-md">
                      <SelectValue placeholder="Select a provider…" />
                    </SelectTrigger>
                    <SelectContent>
                      {customProviders.map((cp) => (
                        <SelectItem key={cp.id} value={cp.id} className="text-xs">
                          {cp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Model name</Label>
                  <Input
                    value={ttsOpenAIModel}
                    onChange={(e) => setTtsOpenAIModel(e.target.value)}
                    placeholder="qwen3-tts"
                    className="h-7 text-xs rounded-md"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Voice ID</Label>
                  <Input
                    value={ttsOpenAIVoice}
                    onChange={(e) => setTtsOpenAIVoice(e.target.value)}
                    placeholder="af_bella"
                    className="h-7 text-xs rounded-md"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Language</Label>
                  <Input
                    value={ttsOpenAILanguage}
                    onChange={(e) => setTtsOpenAILanguage(e.target.value)}
                    placeholder="French"
                    className="h-7 text-xs rounded-md"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STT Provider ── */}
        <div className="flex items-center justify-between py-3.5 gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium">Voice STT Provider</p>
            <p className="text-xs text-muted-foreground mt-0.5">Engine used for speech transcription</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-[220px] h-8 text-xs rounded-lg shrink-0 justify-between font-normal"
              >
                {getSTTProviderConfig(sttProvider)?.label ?? 'ElevenLabs'}
                <ChevronDown className="size-3.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[300px]">
              <DropdownMenuRadioGroup value={sttProvider} onValueChange={(v) => setSttProvider(v as STTProvider)}>
                {STT_PROVIDERS.map((p) => (
                  <DropdownMenuRadioItem key={p.value} value={p.value} className="text-xs">
                    <div className="flex flex-col">
                      <span className="font-medium">{p.label}</span>
                      <span className="text-[10px] text-muted-foreground">{p.description}</span>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── Custom STT config ── */}
        {sttProvider === 'openai-compatible' && (
          <div className="py-3.5 space-y-2.5">
            <p className="text-xs text-muted-foreground font-medium">Custom STT Server</p>
            {customProviders.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60">
                Add a provider in the <span className="font-medium">Custom AI Providers</span> section first.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Provider</Label>
                  <Select value={sttCustomProviderId} onValueChange={setSttCustomProviderId}>
                    <SelectTrigger className="h-7 text-xs rounded-md">
                      <SelectValue placeholder="Select a provider…" />
                    </SelectTrigger>
                    <SelectContent>
                      {customProviders.map((cp) => (
                        <SelectItem key={cp.id} value={cp.id} className="text-xs">
                          {cp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Model name</Label>
                  <Input
                    value={sttOpenAIModel}
                    onChange={(e) => setSttOpenAIModel(e.target.value)}
                    placeholder="whisper-1"
                    className="h-7 text-xs rounded-md"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Image Generation Provider ── */}
        <div className="flex flex-col gap-1.5 py-3.5 border-t border-border/40">
          <p className="text-sm font-medium">Image Generation</p>
          <p className="text-xs text-muted-foreground">
            Custom OpenAI-compatible server for <code className="text-[11px]">/v1/images/generations</code> — Max
            subscribers only
          </p>
        </div>
        <div className="py-3.5 space-y-2.5">
          {customProviders.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/60">
              Add a provider in the <span className="font-medium">Custom AI Providers</span> section first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px] text-muted-foreground">Provider</Label>
                <Select value={imageGenCustomProviderId} onValueChange={setImageGenCustomProviderId}>
                  <SelectTrigger className="h-7 text-xs rounded-md">
                    <SelectValue placeholder="Select a provider…" />
                  </SelectTrigger>
                  <SelectContent>
                    {customProviders.map((cp) => (
                      <SelectItem key={cp.id} value={cp.id} className="text-xs">
                        {cp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px] text-muted-foreground">Model name</Label>
                <Input
                  value={imageGenModel}
                  onChange={(e) => setImageGenModel(e.target.value)}
                  placeholder="dall-e-3"
                  className="h-7 text-xs rounded-md"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px] text-muted-foreground">Extra request body (JSON)</Label>
                <Textarea
                  value={imageGenRequestBody}
                  onChange={(e) => setImageGenRequestBody(e.target.value)}
                  placeholder='{"quality": "hd"}'
                  rows={6}
                  className="text-xs rounded-md font-mono resize-y min-h-24"
                />
                {imageGenRequestBodyError && (
                  <p className="text-[10px] text-red-500 flex items-center gap-1">
                    <AlertCircle className="size-3 shrink-0" />
                    Invalid JSON — this field is ignored until fixed: {imageGenRequestBodyError}
                  </p>
                )}
              </div>
              <ImagePromptPresetEditor
                skillLabel="image-generation"
                defaultInstructions={IMAGE_GENERATION_DEFAULT_INSTRUCTIONS}
                systemPrompt={imageGenSystemPrompt}
                setSystemPrompt={setImageGenSystemPrompt}
                model={imageGenModel}
                setModel={setImageGenModel}
                presets={imageGenPromptPresets}
                setPresets={setImageGenPromptPresets}
                selectedPresetId={selectedImageGenPresetId}
                setSelectedPresetId={setSelectedImageGenPresetId}
                newPresetName={newImageGenPresetName}
                setNewPresetName={setNewImageGenPresetName}
              />
            </div>
          )}
        </div>

        {/* ── Image Editing Provider ── */}
        <div className="flex flex-col gap-1.5 py-3.5 border-t border-border/40">
          <p className="text-sm font-medium">Image Editing</p>
          <p className="text-xs text-muted-foreground">
            Custom OpenAI-compatible server for <code className="text-[11px]">/v1/images/edits</code> — Max subscribers
            only
          </p>
        </div>
        <div className="py-3.5 space-y-2.5">
          {customProviders.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/60">
              Add a provider in the <span className="font-medium">Custom AI Providers</span> section first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px] text-muted-foreground">Provider</Label>
                <Select value={imageEditCustomProviderId} onValueChange={setImageEditCustomProviderId}>
                  <SelectTrigger className="h-7 text-xs rounded-md">
                    <SelectValue placeholder="Select a provider…" />
                  </SelectTrigger>
                  <SelectContent>
                    {customProviders.map((cp) => (
                      <SelectItem key={cp.id} value={cp.id} className="text-xs">
                        {cp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px] text-muted-foreground">Model name</Label>
                <Input
                  value={imageEditModel}
                  onChange={(e) => setImageEditModel(e.target.value)}
                  placeholder="dall-e-2"
                  className="h-7 text-xs rounded-md"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-[10px] text-muted-foreground">Extra request body (JSON)</Label>
                <Textarea
                  value={imageEditRequestBody}
                  onChange={(e) => setImageEditRequestBody(e.target.value)}
                  placeholder='{"size": "1024x1024"}'
                  rows={6}
                  className="text-xs rounded-md font-mono resize-y min-h-24"
                />
                {imageEditRequestBodyError && (
                  <p className="text-[10px] text-red-500 flex items-center gap-1">
                    <AlertCircle className="size-3 shrink-0" />
                    Invalid JSON — this field is ignored until fixed: {imageEditRequestBodyError}
                  </p>
                )}
              </div>
              <ImagePromptPresetEditor
                skillLabel="image-editing"
                defaultInstructions={IMAGE_EDITING_DEFAULT_INSTRUCTIONS}
                systemPrompt={imageEditSystemPrompt}
                setSystemPrompt={setImageEditSystemPrompt}
                model={imageEditModel}
                setModel={setImageEditModel}
                presets={imageEditPromptPresets}
                setPresets={setImageEditPromptPresets}
                selectedPresetId={selectedImageEditPresetId}
                setSelectedPresetId={setSelectedImageEditPresetId}
                newPresetName={newImageEditPresetName}
                setNewPresetName={setNewImageEditPresetName}
              />
            </div>
          )}
        </div>

        {/* ── Voice Backend (cloud vs local speech-to-speech) ── */}
        {voiceEnabled && offersBackendChoice && voiceS2SBackend && (
          <div className="flex items-center justify-between py-3.5 border-t border-border/40 gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium">Voice Backend</p>
              <p className="text-xs text-muted-foreground mt-0.5">Speech-to-speech engine used by the Voice page</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-[220px] h-8 text-xs rounded-lg shrink-0 justify-between font-normal"
                >
                  {getVoiceS2SBackendConfig(voiceS2SBackend)?.label ?? 'Cloud (xAI Realtime)'}
                  <ChevronDown className="size-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[300px]">
                <DropdownMenuRadioGroup
                  value={voiceS2SBackend}
                  onValueChange={(v) => setVoiceS2SBackend(v as VoiceS2SBackend)}
                >
                  {VOICE_S2S_BACKENDS.map((b) => (
                    <DropdownMenuRadioItem key={b.value} value={b.value} className="text-xs">
                      <div className="flex flex-col">
                        <span className="font-medium">{b.label}</span>
                        <span className="text-[10px] text-muted-foreground">{b.description}</span>
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {voiceEnabled && voiceS2SBackend === 'local' && (
          <p className="text-[11px] text-muted-foreground/60 pb-3.5">
            Uses the model picked in the chat model selector, plus the STT/TTS providers configured above.
          </p>
        )}
      </div>
    </div>
  );
}
