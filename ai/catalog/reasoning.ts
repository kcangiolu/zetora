// Translates the reasoning-effort toggle into each route's provider options,
// from the effort values and switches models.dev declares for the model.
// Pure: one function per API dialect, none per model.
import type { JSONObject, SharedV3ProviderOptions } from '@ai-sdk/provider';
import type { ReasoningCapability, ReasoningEffort } from '@/lib/reasoning-effort-types';
import { LABS, type DirectClient } from './config';
import { EFFORT_LEVELS, type CatalogEntry, type CatalogRoute, type EffortLevel, type ReasoningSpec } from './types';

type Dialect =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'cohere'
  // { thinking: { type: 'enabled' | 'disabled' } }: Zhipu, Moonshot.
  | 'thinking-type'
  // { enable_thinking: boolean }: Qwen-style APIs.
  | 'enable-thinking'
  | 'openrouter'
  // A bare OpenAI-style reasoning_effort string.
  | 'reasoning-effort';

const DIRECT_DIALECTS: Record<DirectClient, { dialect: Dialect; key: string }> = {
  openai: { dialect: 'openai', key: 'openai' },
  anthropic: { dialect: 'anthropic', key: 'anthropic' },
  google: { dialect: 'google', key: 'google' },
  vertex: { dialect: 'google', key: 'vertex' },
  xai: { dialect: 'xai', key: 'xai' },
  deepseek: { dialect: 'deepseek', key: 'deepseek' },
  mistral: { dialect: 'mistral', key: 'mistral' },
  cohere: { dialect: 'cohere', key: 'cohere' },
  zai: { dialect: 'thinking-type', key: 'zai' },
  minimax: { dialect: 'reasoning-effort', key: 'minimax' },
  sarvam: { dialect: 'reasoning-effort', key: 'sarvam' },
};

// The AI Gateway forwards options keyed by the upstream provider's slug.
const GATEWAY_DIALECTS: Record<string, Dialect> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  xai: 'xai',
  spacexai: 'xai',
  deepseek: 'deepseek',
  zai: 'thinking-type',
  moonshotai: 'thinking-type',
  alibaba: 'enable-thinking',
};

function routeDialect(entry: CatalogEntry, route: CatalogRoute): { dialect: Dialect; key: string } {
  switch (route.host) {
    case 'direct': {
      const client = LABS.find((lab) => lab.id === entry.lab)?.direct?.client;
      return client ? DIRECT_DIALECTS[client] : { dialect: 'reasoning-effort', key: entry.lab };
    }
    case 'groq':
      return { dialect: 'groq', key: 'groq' };
    case 'novita':
      return { dialect: 'enable-thinking', key: 'novita' };
    case 'openrouter':
      return { dialect: 'openrouter', key: 'openrouter' };
    case 'gateway': {
      const vendor = route.modelId.slice(0, route.modelId.indexOf('/'));
      return { dialect: GATEWAY_DIALECTS[vendor] ?? 'reasoning-effort', key: vendor };
    }
  }
}

// Effort values each dialect's SDK accepts (anything else fails its schema).
// Absent: no fixed list, models.dev's values are sent as they are.
const ACCEPTED_EFFORTS: Partial<Record<Dialect, EffortLevel[]>> = {
  openai: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  anthropic: ['low', 'medium', 'high', 'xhigh', 'max'],
  google: ['minimal', 'low', 'medium', 'high'],
  xai: ['low', 'high'],
  groq: ['none', 'low', 'medium', 'high'],
  mistral: ['none', 'high'],
  deepseek: ['low', 'high', 'max'],
};

// Dialects whose API can always switch thinking off, whatever models.dev lists.
const ALWAYS_DISABLEABLE = new Set<Dialect>([
  'anthropic',
  'deepseek',
  'cohere',
  'thinking-type',
  'enable-thinking',
  'openrouter',
]);

// What the toggle resolved to for one route: an effort value it accepts, a
// thinking budget, or thinking switched off. No effort and no budget means
// the provider's own default.
interface Plan {
  enabled: boolean;
  effort?: EffortLevel;
  budget?: number;
  // Thinking could not actually be switched off, only turned down: hide it.
  hide: boolean;
}

const BUDGETS: Record<'low' | 'medium' | 'high', number> = { low: 1024, medium: 4000, high: 16000 };

function nearestEffort(efforts: EffortLevel[], target: EffortLevel): EffortLevel {
  const rank = (level: EffortLevel) => EFFORT_LEVELS.indexOf(level);
  // Ties go to the stronger level.
  return efforts.reduce((best, level) =>
    Math.abs(rank(level) - rank(target)) <= Math.abs(rank(best) - rank(target)) ? level : best,
  );
}

function clampBudget(spec: ReasoningSpec, budget: number): number {
  return Math.min(Math.max(budget, spec.budget?.min ?? 0), spec.budget?.max ?? Infinity);
}

// 'auto' normally leaves the provider's default alone, except where that
// default doesn't think at all (Groq's default effort on Qwen, verified live).
const AUTO_EFFORT: Partial<Record<Dialect, Exclude<ReasoningEffort, 'auto' | 'off'>>> = { groq: 'medium' };

function plan(spec: ReasoningSpec, requested: ReasoningEffort, dialect: Dialect): Plan {
  const effort = requested === 'auto' ? (AUTO_EFFORT[dialect] ?? 'auto') : requested;
  if (effort === 'auto') return { enabled: true, hide: false };
  const accepted = ACCEPTED_EFFORTS[dialect];
  const efforts = accepted ? spec.efforts.filter((level) => accepted.includes(level)) : spec.efforts;
  const levels = efforts.filter((level) => level !== 'none');

  if (effort === 'off') {
    if (efforts.includes('none')) return { enabled: true, effort: 'none', hide: false };
    if (spec.toggle || ALWAYS_DISABLEABLE.has(dialect)) return { enabled: false, hide: false };
    if (spec.budget?.min === 0) return { enabled: true, budget: 0, hide: false };
    if (levels.length) return { enabled: true, effort: levels[0], hide: true };
    if (spec.budget) return { enabled: true, budget: clampBudget(spec, 0), hide: true };
    return { enabled: true, hide: true };
  }

  if (levels.length) return { enabled: true, effort: nearestEffort(levels, effort), hide: false };
  if (spec.budget) return { enabled: true, budget: clampBudget(spec, BUDGETS[effort]), hide: false };
  return { enabled: true, hide: false };
}

function dialectOptions(dialect: Dialect, spec: ReasoningSpec, p: Plan): JSONObject {
  const disabled = !p.enabled || p.effort === 'none';
  switch (dialect) {
    case 'openai':
      return {
        ...(p.effort ? { reasoningEffort: p.effort } : {}),
        ...(disabled ? {} : { reasoningSummary: 'detailed', include: ['reasoning.encrypted_content'] }),
      };
    case 'anthropic':
      if (disabled) return { thinking: { type: 'disabled' } };
      // Effort-driven models think adaptively; summarized display is what
      // makes the newer ones return their thinking text at all.
      if (spec.efforts.length) {
        return {
          sendReasoning: true,
          thinking: { type: 'adaptive', display: 'summarized' },
          ...(p.effort ? { effort: p.effort } : {}),
        };
      }
      return {
        sendReasoning: true,
        thinking: { type: 'enabled', budgetTokens: p.budget ?? clampBudget(spec, BUDGETS.medium) },
      };
    case 'google':
      return {
        thinkingConfig: {
          ...(p.effort && p.effort !== 'none' ? { thinkingLevel: p.effort } : {}),
          ...(p.budget !== undefined ? { thinkingBudget: p.budget } : {}),
          ...(!p.enabled ? { thinkingBudget: 0 } : {}),
          includeThoughts: !disabled && !p.hide,
        },
      };
    case 'xai':
    case 'mistral':
      return p.effort ? { reasoningEffort: p.effort } : {};
    case 'groq':
      return {
        ...(p.effort ? { reasoningEffort: p.effort } : {}),
        reasoningFormat: disabled || p.hide ? 'hidden' : 'parsed',
      };
    case 'deepseek':
      return disabled
        ? { thinking: { type: 'disabled' } }
        : { thinking: { type: 'enabled' }, ...(p.effort ? { reasoningEffort: p.effort } : {}) };
    case 'cohere':
      return disabled
        ? { thinking: { type: 'disabled' } }
        : { thinking: { type: 'enabled', ...(p.budget !== undefined ? { tokenBudget: p.budget } : {}) } };
    case 'thinking-type':
      return disabled
        ? { thinking: { type: 'disabled' } }
        : { thinking: { type: 'enabled' }, ...(p.effort ? { reasoning_effort: p.effort } : {}) };
    case 'enable-thinking':
      return {
        enable_thinking: !disabled,
        ...(p.budget !== undefined && !disabled ? { thinking_budget: p.budget } : {}),
      };
    case 'openrouter':
      return {
        reasoning: disabled
          ? { enabled: false }
          : {
              ...(p.effort ? { effort: p.effort } : {}),
              ...(p.budget !== undefined ? { max_tokens: p.budget } : {}),
              exclude: p.hide,
            },
      };
    case 'reasoning-effort':
      return p.effort ? { reasoning_effort: p.effort } : {};
  }
}

function merge(target: SharedV3ProviderOptions, key: string, options: JSONObject) {
  if (Object.keys(options).length) target[key] = { ...target[key], ...options };
}

// Provider options for every route of the model at this effort. Models
// served as a thinking/instant pair switch upstream model instead (see
// ai/reasoning-switch-model.ts), so only their thinking routes get options.
export function getReasoningProviderOptions(entry: CatalogEntry, effort: ReasoningEffort): SharedV3ProviderOptions {
  const options: SharedV3ProviderOptions = {};
  const spec = entry.reasoning;
  if (!spec) return options;
  // 'off' already selected the instant model.
  const effectiveEffort = entry.instantRoutes && effort === 'off' ? 'auto' : effort;
  for (const route of entry.routes) {
    const { dialect, key } = routeDialect(entry, route);
    merge(options, key, dialectOptions(dialect, spec, plan(spec, effectiveEffort, dialect)));
  }
  return options;
}

// How the reasoning toggle is shown for a model.
export function getReasoningCapabilityFor(entry: CatalogEntry): ReasoningCapability {
  const spec = entry.reasoning;
  if (!spec) return null;
  if (spec.budget || spec.efforts.filter((level) => level !== 'none').length > 1) return 'full';
  if (spec.toggle || spec.efforts.includes('none')) return 'binary-guaranteed';
  return null;
}
