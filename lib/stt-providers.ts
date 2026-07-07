export const STT_PROVIDERS = [
  {
    value: 'elevenlabs' as const,
    label: 'ElevenLabs',
    description: 'Scribe v2 — transcription haute précision',
    requiresApiKey: true,
    defaultModel: 'scribe_v2',
  },
  {
    value: 'openai-compatible' as const,
    label: 'Custom (OpenAI-compatible)',
    description: 'Parakeet, Whisper local, ou tout serveur /v1/audio/transcriptions',
    requiresApiKey: false,
    defaultModel: 'whisper-1',
  },
] as const;

export type STTProvider = (typeof STT_PROVIDERS)[number]['value'];

export function getSTTProviderConfig(provider: STTProvider) {
  return STT_PROVIDERS.find((p) => p.value === provider);
}
