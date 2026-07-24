// Client-safe reasoning-effort types, split out from lib/reasoning-effort.ts
// (which is 'server-only') so the model catalog (ai/models/types.ts) and
// client components can type against them without pulling in server code.

export type ReasoningEffort = 'auto' | 'low' | 'medium' | 'high' | 'off';
export const REASONING_EFFORT_LEVELS: readonly ReasoningEffort[] = ['auto', 'low', 'medium', 'high', 'off'];

// 'full'      - the provider accepts a real effort/budget parameter.
// 'mask-only' - nothing can be tuned server-side; the toggle can only hide
//               the model's <think> output from the response.
// null        - the model doesn't reason at all; hide the toggle entirely.
export type ReasoningCapability = 'full' | 'mask-only' | null;
