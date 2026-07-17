import 'server-only';

const PROVIDER_ENV_KEYS: Record<string, string | null> = {
  xai: 'XAI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  groq: 'GROQ_API_KEY',
  alibaba: 'ALIBABA_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  bytedance: 'ARK_API_KEY',
  arcee: null,
  vercel: 'VERCEL_API_KEY',
  amazon: 'AWS_ACCESS_KEY_ID',
  xiaomi: null,
  kwaipilot: null,
  stepfun: null,
  inception: null,
  sarvam: 'SARVAM_API_KEY',
  nvidia: null,
};

export function getAvailableProviders(): string[] {
  return Object.entries(PROVIDER_ENV_KEYS)
    .filter(([, envKey]) => {
      if (envKey === null) return false;
      const value = process.env[envKey];
      return !!value && !value.startsWith('your-') && !value.startsWith('sk-your-');
    })
    .map(([provider]) => provider);
}

export function getAvailableCustomProviders(): string[] {
  const customs: string[] = [];
  if (process.env.OLLAMA_URL) customs.push('ollama');
  if (process.env.LLAMACPP_URL) customs.push('llamacpp');
  return customs;
}
