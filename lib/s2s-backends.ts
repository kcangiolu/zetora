export const VOICE_S2S_BACKENDS = [
  {
    value: 'cloud' as const,
    label: 'Cloud (xAI Realtime)',
    description: 'Speech-to-speech via xAI Grok Realtime, voices Ara, Rex…',
  },
  {
    value: 'local' as const,
    label: 'Self-hosted',
    description: 'Self-hosted STT, LLM and TTS (Whisper, the selected model, a custom TTS server)',
  },
] as const;

export type VoiceS2SBackend = (typeof VOICE_S2S_BACKENDS)[number]['value'];

export function getVoiceS2SBackendConfig(backend: VoiceS2SBackend) {
  return VOICE_S2S_BACKENDS.find((b) => b.value === backend);
}

// The backend the Voice page uses: the user's choice when this instance has
// it, else the one it has, else null (neither XAI_API_KEY nor VOICE_S2S_URL is set).
export function resolveVoiceS2SBackend(
  preferred: VoiceS2SBackend,
  available: { cloudVoice: boolean; localVoice: boolean },
): VoiceS2SBackend | null {
  const isAvailable = (backend: VoiceS2SBackend) => (backend === 'cloud' ? available.cloudVoice : available.localVoice);
  if (isAvailable(preferred)) return preferred;
  return VOICE_S2S_BACKENDS.map((b) => b.value).find(isAvailable) ?? null;
}
