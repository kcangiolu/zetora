// Which providers Zetora can reach and which labs (model makers) it lists.
// This is the only hand-maintained part of the model catalog: the models
// themselves, their capabilities and their limits come from models.dev (see
// ai/catalog/build.ts). Adding a provider or a lab is one entry here.

// Every API a model can be called through, built in ai/providers.ts.
export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'vertex'
  | 'xai'
  | 'deepseek'
  | 'mistral'
  | 'cohere'
  | 'zhipu'
  | 'minimax'
  | 'sarvam'
  | 'groq'
  | 'novita'
  | 'gateway'
  | 'openrouter';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  // models.dev provider id listing this provider's models.
  source: string;
  // Keeps only the matching models of the source.
  include?: RegExp;
  // Any one of these being set makes the provider available.
  envKeys: string[];
  // A lab's own API: every model it lists is that lab's. Aggregators leave it
  // out, and each of their `vendor/model` ids names its lab (see LABS).
  lab?: string;
}

// In picker order: the labs' own APIs, then the aggregators.
export const PROVIDERS: ProviderConfig[] = [
  { id: 'openai', name: 'OpenAI', source: 'openai', envKeys: ['OPENAI_API_KEY'], lab: 'openai' },
  { id: 'anthropic', name: 'Anthropic', source: 'anthropic', envKeys: ['ANTHROPIC_API_KEY'], lab: 'anthropic' },
  {
    id: 'google',
    name: 'Google AI Studio',
    source: 'google',
    envKeys: ['GOOGLE_AI_STUDIO_API_KEY'],
    lab: 'google',
  },
  {
    // Gemini billed to a Google Cloud account (ex-Vertex AI).
    id: 'vertex',
    name: 'Google Agent Platform',
    source: 'google-vertex',
    include: /^gemini-/,
    envKeys: ['GOOGLE_AGENT_PLATFORM_API_KEY'],
    lab: 'google',
  },
  { id: 'xai', name: 'xAI', source: 'xai', envKeys: ['XAI_API_KEY'], lab: 'xai' },
  { id: 'deepseek', name: 'DeepSeek', source: 'deepseek', envKeys: ['DEEPSEEK_API_KEY'], lab: 'deepseek' },
  { id: 'mistral', name: 'Mistral', source: 'mistral', envKeys: ['MISTRAL_API_KEY'], lab: 'mistral' },
  { id: 'cohere', name: 'Cohere', source: 'cohere', envKeys: ['COHERE_API_KEY'], lab: 'cohere' },
  { id: 'zhipu', name: 'Zhipu AI', source: 'zai', envKeys: ['ZAI_API_KEY'], lab: 'zhipu' },
  { id: 'minimax', name: 'Minimax', source: 'minimax', envKeys: ['MINIMAX_API_KEY'], lab: 'minimax' },
  { id: 'sarvam', name: 'Sarvam', source: 'sarvam', envKeys: ['SARVAM_API_KEY'], lab: 'sarvam' },
  { id: 'groq', name: 'Groq', source: 'groq', envKeys: ['GROQ_API_KEY'] },
  { id: 'novita', name: 'Novita', source: 'novita-ai', envKeys: ['NOVITA_API_KEY'] },
  {
    id: 'gateway',
    name: 'Vercel AI Gateway',
    source: 'vercel',
    envKeys: ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN'],
  },
  { id: 'openrouter', name: 'OpenRouter', source: 'openrouter', envKeys: ['OPENROUTER_API_KEY'] },
];

export interface LabConfig {
  id: string;
  name: string;
  // The vendor prefixes aggregators put before this lab's model ids. An
  // aggregator model whose prefix no lab claims is left out, which keeps
  // their catalogs of several hundred models to the labs listed here.
  vendors: string[];
}

export const LABS: LabConfig[] = [
  { id: 'openai', name: 'OpenAI', vendors: ['openai'] },
  { id: 'anthropic', name: 'Anthropic', vendors: ['anthropic'] },
  { id: 'google', name: 'Google', vendors: ['google'] },
  { id: 'xai', name: 'xAI', vendors: ['xai', 'spacexai', 'x-ai'] },
  { id: 'deepseek', name: 'DeepSeek', vendors: ['deepseek'] },
  { id: 'mistral', name: 'Mistral', vendors: ['mistral', 'mistralai'] },
  { id: 'cohere', name: 'Cohere', vendors: ['cohere'] },
  { id: 'zhipu', name: 'Zhipu AI', vendors: ['zai-org', 'zai', 'z-ai'] },
  { id: 'moonshot', name: 'MoonShot', vendors: ['moonshotai'] },
  { id: 'alibaba', name: 'Alibaba', vendors: ['qwen', 'alibaba'] },
  { id: 'minimax', name: 'Minimax', vendors: ['minimax', 'minimaxai'] },
  { id: 'bytedance', name: 'ByteDance', vendors: ['bytedance', 'bytedance-seed'] },
  { id: 'arcee', name: 'Arcee', vendors: ['arcee-ai'] },
  { id: 'amazon', name: 'Amazon', vendors: ['amazon'] },
  { id: 'xiaomi', name: 'Xiaomi', vendors: ['xiaomimimo', 'xiaomi'] },
  { id: 'stepfun', name: 'StepFun', vendors: ['stepfun'] },
  { id: 'sarvam', name: 'Sarvam', vendors: [] },
  { id: 'inception', name: 'Inception', vendors: ['inception'] },
  { id: 'nvidia', name: 'NVIDIA', vendors: ['nvidia'] },
];
