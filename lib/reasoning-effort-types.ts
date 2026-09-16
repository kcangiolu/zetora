// Client-safe reasoning-effort types, split out from lib/reasoning-effort.ts
// (which is 'server-only') so the model catalog (ai/models/types.ts) and
// client components can type against them without pulling in server code.

export type ReasoningEffort = 'auto' | 'low' | 'medium' | 'high' | 'off';
export const REASONING_EFFORT_LEVELS: readonly ReasoningEffort[] = ['auto', 'low', 'medium', 'high', 'off'];

// 'full'              - the provider accepts a real, distinct effort/budget
//                        parameter per level (low/medium/high really differ).
// 'binary-guaranteed' - a real, server-enforced on/off switch exists (e.g.
//                        llama.cpp's prompt-injected enable_thinking, Ollama's
//                        native `think` bool), but no level in between does
//                        anything distinct — low/medium/high would be
//                        cosmetic, so only on/off is exposed.
// 'best-effort'       - a real disable parameter is sent, but whether the
//                        model's own chat template actually honors it is
//                        unverified (e.g. llama.cpp/vLLM's
//                        chat_template_kwargs.enable_thinking through the
//                        OpenAI-compatible shim) — not a guarantee.
// 'mask-only'         - nothing can be tuned server-side; the toggle can only
//                       hide the model's <think> output from the response.
// null                - the model doesn't reason at all; hide the toggle
//                        entirely.
export type ReasoningCapability = 'full' | 'binary-guaranteed' | 'best-effort' | 'mask-only' | null;
