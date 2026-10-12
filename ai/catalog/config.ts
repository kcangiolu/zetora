// Which labs (model makers) Zetora lists, and every way each one can be
// reached. This is the only hand-maintained part of the model catalog: the
// models themselves, their capabilities and their limits come from
// models.dev (see ai/catalog/build.ts). Adding a lab is one entry here.

// Aggregators that serve many labs' models under `vendor/model` ids.
export type HostId = 'groq' | 'novita' | 'gateway' | 'openrouter';

export interface HostConfig {
  id: HostId;
  // models.dev provider id listing this host's models.
  source: string;
  // Any one of these being set makes the host available.
  envKeys: string[];
}

// Ordered by preference: a lab's own API always comes first, then these.
export const HOSTS: HostConfig[] = [
  { id: 'groq', source: 'groq', envKeys: ['GROQ_API_KEY'] },
  { id: 'novita', source: 'novita-ai', envKeys: ['NOVITA_API_KEY'] },
  { id: 'gateway', source: 'vercel', envKeys: ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN'] },
  { id: 'openrouter', source: 'openrouter', envKeys: ['OPENROUTER_API_KEY'] },
];

// The lab's own API, built in ai/providers.ts from this id.
export type DirectClient =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'vertex'
  | 'xai'
  | 'deepseek'
  | 'mistral'
  | 'cohere'
  | 'zai'
  | 'minimax'
  | 'sarvam';

export interface LabConfig {
  id: string;
  name: string;
  // models.dev provider listing the lab's first-party models. Without it, the
  // lab's models are only discovered through the hosts below.
  catalog?: { source: string; include?: RegExp };
  direct?: { client: DirectClient; envKey: string };
  // The vendor prefixes this lab's models use on each host.
  hosts: Partial<Record<HostId, string[]>>;
  // Only listed when the lab's own API is configured; hosts then act as
  // fallbacks for its models and never add models of their own.
  directOnly?: boolean;
}

export const LABS: LabConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    catalog: { source: 'openai' },
    direct: { client: 'openai', envKey: 'OPENAI_API_KEY' },
    hosts: { groq: ['openai'], novita: ['openai'], gateway: ['openai'], openrouter: ['openai'] },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    catalog: { source: 'anthropic' },
    direct: { client: 'anthropic', envKey: 'ANTHROPIC_API_KEY' },
    hosts: { gateway: ['anthropic'], openrouter: ['anthropic'] },
  },
  {
    id: 'google',
    name: 'Google AI Studio',
    catalog: { source: 'google' },
    direct: { client: 'google', envKey: 'GOOGLE_AI_STUDIO_API_KEY' },
    hosts: { gateway: ['google'], openrouter: ['google'] },
  },
  {
    // Gemini billed to a Google Cloud account (ex-Vertex AI), shown as its own
    // tab next to AI Studio.
    id: 'vertex',
    name: 'Google Agent Platform',
    catalog: { source: 'google-vertex', include: /^gemini-/ },
    direct: { client: 'vertex', envKey: 'GOOGLE_AGENT_PLATFORM_API_KEY' },
    hosts: { gateway: ['google'] },
    directOnly: true,
  },
  {
    id: 'xai',
    name: 'xAI',
    catalog: { source: 'xai' },
    direct: { client: 'xai', envKey: 'XAI_API_KEY' },
    hosts: { gateway: ['xai', 'spacexai'], openrouter: ['x-ai'] },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    catalog: { source: 'deepseek' },
    direct: { client: 'deepseek', envKey: 'DEEPSEEK_API_KEY' },
    hosts: { novita: ['deepseek'], gateway: ['deepseek'], openrouter: ['deepseek'] },
  },
  {
    id: 'mistral',
    name: 'Mistral',
    catalog: { source: 'mistral' },
    direct: { client: 'mistral', envKey: 'MISTRAL_API_KEY' },
    hosts: { gateway: ['mistral'], openrouter: ['mistralai'] },
  },
  {
    id: 'cohere',
    name: 'Cohere',
    catalog: { source: 'cohere' },
    direct: { client: 'cohere', envKey: 'COHERE_API_KEY' },
    hosts: { gateway: ['cohere'], openrouter: ['cohere'] },
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI',
    catalog: { source: 'zai' },
    direct: { client: 'zai', envKey: 'ZAI_API_KEY' },
    hosts: { novita: ['zai-org'], gateway: ['zai'], openrouter: ['z-ai'] },
  },
  {
    id: 'moonshot',
    name: 'MoonShot',
    catalog: { source: 'moonshotai' },
    hosts: { novita: ['moonshotai'], gateway: ['moonshotai'], openrouter: ['moonshotai'] },
  },
  {
    id: 'alibaba',
    name: 'Alibaba',
    catalog: { source: 'alibaba' },
    hosts: { groq: ['qwen'], novita: ['qwen'], gateway: ['alibaba'], openrouter: ['qwen'] },
  },
  {
    id: 'minimax',
    name: 'Minimax',
    catalog: { source: 'minimax' },
    direct: { client: 'minimax', envKey: 'MINIMAX_API_KEY' },
    hosts: { novita: ['minimax', 'minimaxai'], gateway: ['minimax'], openrouter: ['minimax'] },
  },
  {
    id: 'bytedance',
    name: 'ByteDance',
    hosts: { gateway: ['bytedance'], openrouter: ['bytedance-seed'] },
  },
  {
    id: 'arcee',
    name: 'Arcee',
    catalog: { source: 'arcee' },
    hosts: { gateway: ['arcee-ai'], openrouter: ['arcee-ai'] },
  },
  {
    id: 'amazon',
    name: 'Amazon',
    hosts: { gateway: ['amazon'], openrouter: ['amazon'] },
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi',
    catalog: { source: 'xiaomi' },
    hosts: { novita: ['xiaomimimo'], gateway: ['xiaomi'], openrouter: ['xiaomi'] },
  },
  {
    id: 'stepfun',
    name: 'StepFun',
    hosts: { novita: ['stepfun'], gateway: ['stepfun'], openrouter: ['stepfun'] },
  },
  {
    id: 'sarvam',
    name: 'Sarvam',
    catalog: { source: 'sarvam' },
    direct: { client: 'sarvam', envKey: 'SARVAM_API_KEY' },
    hosts: {},
  },
  {
    id: 'inception',
    name: 'Inception',
    catalog: { source: 'inception' },
    hosts: { gateway: ['inception'], openrouter: ['inception'] },
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    hosts: { novita: ['nvidia'], gateway: ['nvidia'], openrouter: ['nvidia'] },
  },
];
