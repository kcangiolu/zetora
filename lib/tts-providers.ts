export const TTS_PROVIDERS = [
  {
    value: 'elevenlabs' as const,
    label: 'ElevenLabs',
    description: 'High-quality voices',
    requiresApiKey: true,
    defaultVoice: '90ipbRoKi4CpHXvKVtl0',
    defaultModel: 'eleven_v3',
  },
  {
    value: 'openai-compatible' as const,
    label: 'Custom (OpenAI-compatible)',
    description: 'Qwen3-TTS, Kokoro, Piper, or any /v1/audio/speech server',
    requiresApiKey: false,
    defaultVoice: 'af_bella',
    defaultModel: 'qwen3-tts',
  },
] as const;

export type TTSProvider = (typeof TTS_PROVIDERS)[number]['value'];

export function getTTSProviderConfig(provider: TTSProvider) {
  return TTS_PROVIDERS.find((p) => p.value === provider);
}
