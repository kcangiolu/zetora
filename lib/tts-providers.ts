export const TTS_PROVIDERS = [
  {
    value: 'elevenlabs' as const,
    label: 'ElevenLabs',
    description: 'Voices haute qualité (Ara, Rex, Sal, Eve, Leo)',
    requiresApiKey: true,
    defaultVoice: '90ipbRoKi4CpHXvKVtl0',
    defaultModel: 'eleven_v3',
  },
  {
    value: 'openai-compatible' as const,
    label: 'Custom (OpenAI-compatible)',
    description: 'Qwen3-TTS, Kokoro, Piper, ou tout serveur /v1/audio/speech',
    requiresApiKey: false,
    defaultVoice: 'af_bella',
    defaultModel: 'qwen3-tts',
  },
] as const;

export type TTSProvider = (typeof TTS_PROVIDERS)[number]['value'];

export function getTTSProviderConfig(provider: TTSProvider) {
  return TTS_PROVIDERS.find((p) => p.value === provider);
}
