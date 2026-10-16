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
