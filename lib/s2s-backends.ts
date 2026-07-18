export const VOICE_S2S_BACKENDS = [
  {
    value: 'cloud' as const,
    label: 'Cloud (xAI Realtime)',
    description: 'Speech-to-speech via xAI Grok Realtime, voix Ara/Rex/…',
  },
  {
    value: 'local' as const,
    label: 'Self-hosted',
    description: 'STT/LLM/TTS auto-hébergés (Whisper, modèle sélectionné, Custom TTS Server)',
  },
] as const;

export type VoiceS2SBackend = (typeof VOICE_S2S_BACKENDS)[number]['value'];

export function getVoiceS2SBackendConfig(backend: VoiceS2SBackend) {
  return VOICE_S2S_BACKENDS.find((b) => b.value === backend);
}
