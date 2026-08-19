import 'server-only';
import { Template } from '@huggingface/jinja';
import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createLogger } from '@/lib/logger';

const log = createLogger('llamacpp-prompt');

interface FlatMessage {
  role: string;
  content: string;
}

interface ChatTemplateInfo {
  template: string | null;
  bosToken?: string;
  eosToken?: string;
}

// Keyed by rootURL — same TTL/shape convention as the caches in
// lib/custom-providers.ts (modelsCache/backendKindCache).
const templateCache = new Map<string, { info: ChatTemplateInfo; expiresAt: number }>();
const TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchChatTemplate(rootURL: string, fetchFn: FetchFunction): Promise<ChatTemplateInfo> {
  const cached = templateCache.get(rootURL);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.info;
  }

  let info: ChatTemplateInfo = { template: null };
  try {
    const res = await fetchFn(`${rootURL}/props`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const body = (await res.json()) as { chat_template?: unknown; bos_token?: unknown; eos_token?: unknown };
      if (typeof body.chat_template === 'string' && body.chat_template.length > 0) {
        info = {
          template: body.chat_template,
          bosToken: typeof body.bos_token === 'string' ? body.bos_token : undefined,
          eosToken: typeof body.eos_token === 'string' ? body.eos_token : undefined,
        };
      }
    }
  } catch {
    // Unreachable or malformed /props — fall back to the generic ChatML
    // template below, same best-effort philosophy as probeBackendKind().
  }

  templateCache.set(rootURL, { info, expiresAt: Date.now() + TEMPLATE_CACHE_TTL_MS });
  return info;
}

// Text-only flattening: file parts (images) aren't supported by this native
// path yet — /completion takes a single raw prompt string, and mapping
// mmproj-specific image placeholders per chat template is out of scope for
// this phase. Tool-call/tool-result parts are a defensive fallback (JSON
// stand-in) — they shouldn't reach here since llamacpp native forces the XML
// tool middleware, which already converts them to text before this runs.
function partsToText(parts: ReadonlyArray<{ type: string; text?: string }>): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if ((part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string') {
      chunks.push(part.text);
    } else if (part.type === 'file') {
      log.warn('dropping non-text file part — images are not supported by the llama.cpp native provider yet');
    } else {
      chunks.push(JSON.stringify(part));
    }
  }
  return chunks.join('\n');
}

function flattenMessages(prompt: LanguageModelV3Prompt): FlatMessage[] {
  return prompt.map((message) =>
    message.role === 'system'
      ? { role: 'system', content: message.content }
      : { role: message.role, content: partsToText(message.content as ReadonlyArray<{ type: string; text?: string }>) },
  );
}

function renderChatMl(messages: FlatMessage[], addGenerationPrompt: boolean): string {
  let out = '';
  for (const m of messages) {
    out += `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`;
  }
  if (addGenerationPrompt) out += '<|im_start|>assistant\n';
  return out;
}

const CHATML_STOP = ['<|im_end|>'];

export interface RenderLlamaCppPromptOptions {
  rootURL: string;
  fetch?: FetchFunction;
  enableThinking?: boolean;
}

export interface RenderLlamaCppPromptResult {
  promptText: string;
  stopSequences: string[];
}

// Renders a LanguageModelV3Prompt into the raw string llama.cpp's /completion
// endpoint expects, using the model's own chat template (served at /props) so
// the prompt matches whatever GGUF is actually loaded. When the last message
// is `assistant`, that text is appended verbatim after the rendered
// generation prompt with no closing tag — true prefill, since /completion has
// no notion of message roles and just continues whatever string it's given.
export async function renderLlamaCppPrompt(
  prompt: LanguageModelV3Prompt,
  opts: RenderLlamaCppPromptOptions,
): Promise<RenderLlamaCppPromptResult> {
  const fetchFn = opts.fetch ?? fetch;
  const flat = flattenMessages(prompt);

  const last = flat.at(-1);
  const prefillText = last?.role === 'assistant' ? last.content : null;
  const templateMessages = prefillText !== null ? flat.slice(0, -1) : flat;

  const { template, bosToken, eosToken } = await fetchChatTemplate(opts.rootURL, fetchFn);

  let rendered: string;
  let stopSequences: string[];

  if (template) {
    try {
      rendered = new Template(template).render({
        messages: templateMessages,
        add_generation_prompt: true,
        bos_token: bosToken ?? '',
        eos_token: eosToken ?? '',
        enable_thinking: opts.enableThinking ?? true,
      });
      stopSequences = eosToken ? [eosToken] : [];
    } catch (error) {
      log.warn('chat_template render failed, falling back to ChatML', error);
      rendered = renderChatMl(templateMessages, true);
      stopSequences = CHATML_STOP;
    }
  } else {
    rendered = renderChatMl(templateMessages, true);
    stopSequences = CHATML_STOP;
  }

  return {
    promptText: prefillText !== null ? rendered + prefillText : rendered,
    stopSequences,
  };
}

export interface ReasoningDelimiters {
  open: string;
  close: string;
  startsInReasoning: boolean;
}

// Unique enough that no real reasoning text would ever collide with it, and
// distinguishable at a glance if it ever leaked into a log.
const REASONING_PROBE_SENTINEL = 'ZETORA_REASONING_PROBE_7f3a9c';

// Cached alongside templateCache, same TTL/shape — a template rarely changes
// for a running server, so a fixed window matches every other cache here
// without needing manual invalidation.
const reasoningDelimiterCache = new Map<string, { delimiters: ReasoningDelimiters | null; expiresAt: number }>();

// The one place that decides how the native llama.cpp path should mask a
// model's reasoning output — derived from the model's own chat template
// instead of a hardcoded tagName per model family, so a new/unknown model's
// custom reasoning syntax (e.g. this Gemma-based merge's `<|channel>thought`)
// never needs a bespoke fix. See deriveReasoningDelimiters for the algorithm.
export async function detectReasoningDelimiters(
  rootURL: string,
  fetchFn: FetchFunction = fetch,
): Promise<ReasoningDelimiters | null> {
  const cached = reasoningDelimiterCache.get(rootURL);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.delimiters;
  }

  const { template, bosToken, eosToken } = await fetchChatTemplate(rootURL, fetchFn);
  const delimiters = template ? deriveReasoningDelimiters(template, bosToken, eosToken) : null;

  reasoningDelimiterCache.set(rootURL, { delimiters, expiresAt: Date.now() + TEMPLATE_CACHE_TTL_MS });
  return delimiters;
}

interface ProbeMessage {
  role: string;
  content: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  reasoning?: string;
}

// A user turn followed by an assistant turn with a tool call: this specific
// template only wraps `reasoning` in its channel syntax when the message has
// tool_calls AND follows the last user message — a plausible baseline
// condition set to probe against for any chat template that gates reasoning
// rendering similarly. Templates that render reasoning unconditionally still
// produce a valid, detectable diff against this same probe.
function buildProbeMessages(): ProbeMessage[] {
  return [
    { role: 'user', content: 'probe' },
    {
      role: 'assistant',
      content: 'probe-answer',
      tool_calls: [{ id: '1', function: { name: 'probe_tool', arguments: '{}' } }],
    },
  ];
}

// Pure — no I/O, no caching — a template's own render output is the single
// source of truth for how it wraps a `reasoning`/`reasoning_content` field,
// so this derives the exact open/close delimiter pair (and whether the
// opening one is prefilled into the prompt itself) by diffing two renders of
// a synthetic conversation, rather than hardcoding a format per model family.
// The probe builds its own raw message objects instead of going through
// flattenMessages/LanguageModelV3Prompt, since it needs `tool_calls` and
// `reasoning` fields that flattening doesn't carry today (a known, separate
// gap in history-replay fidelity — out of scope here).
export function deriveReasoningDelimiters(
  template: string,
  bosToken?: string,
  eosToken?: string,
): ReasoningDelimiters | null {
  const renderOpts = {
    add_generation_prompt: false,
    bos_token: bosToken ?? '',
    eos_token: eosToken ?? '',
    enable_thinking: true,
  };

  let renderA: string;
  let renderB: string;
  try {
    const compiled = new Template(template);
    renderA = compiled.render({ messages: buildProbeMessages(), ...renderOpts });
    const withReasoning = buildProbeMessages();
    withReasoning[1].reasoning = REASONING_PROBE_SENTINEL;
    renderB = compiled.render({ messages: withReasoning, ...renderOpts });
  } catch (error) {
    log.warn('reasoning-delimiter probe render failed', error);
    return null;
  }

  if (renderA === renderB) return null; // template doesn't render a `reasoning` field at all

  const sentinelIdx = renderB.indexOf(REASONING_PROBE_SENTINEL);
  if (sentinelIdx === -1) return null;
  if (renderB.indexOf(REASONING_PROBE_SENTINEL, sentinelIdx + 1) !== -1) return null; // ambiguous, appears >1x

  // renderB must equal renderA with a single contiguous insertion (of a
  // known length: the two renders only differ in the `reasoning` field) at
  // some position k — i.e. renderA.slice(0,k) === renderB.slice(0,k) AND
  // renderA.slice(k) === renderB.slice(k + insertedLength). Naive prefix and
  // suffix scans done independently can each overshoot by a few characters
  // when the delimiter shares a short leading substring with whatever
  // follows it — e.g. this exact template's `<|channel>` and `<|tool_call>`
  // both start with `<|`, which is the norm for this class of template
  // (every special token uses the same punctuation), not a rare edge case.
  // Requiring both conditions to hold together, and taking the smallest
  // valid k, resolves that ambiguity — confirmed against the real motivating
  // template's exact output (see tests/llamacpp-reasoning-delimiters.test.ts).
  const insertedLength = renderB.length - renderA.length;
  if (insertedLength <= REASONING_PROBE_SENTINEL.length) return null; // no room for open+close at all

  const maxInsertionPoint = Math.min(sentinelIdx, renderA.length);
  let insertionPoint = -1;
  for (let k = 0; k <= maxInsertionPoint; k++) {
    if (renderA.slice(k) === renderB.slice(k + insertedLength) && renderA.slice(0, k) === renderB.slice(0, k)) {
      insertionPoint = k;
      break;
    }
  }
  if (insertionPoint === -1) return null; // not a single localized insertion — bail rather than guess

  const open = renderB.slice(insertionPoint, sentinelIdx);
  const close = renderB.slice(sentinelIdx + REASONING_PROBE_SENTINEL.length, insertionPoint + insertedLength);
  if (open.trim().length === 0 || close.trim().length === 0) return null;

  return { open, close, startsInReasoning: deriveStartsInReasoning(template, bosToken, eosToken, open) };
}

// Qwen3-style templates prefill the opening reasoning tag into the rendered
// PROMPT itself when thinking is on (so the model's completion never emits
// it) — other templates (e.g. this Gemma-based one) leave the model to emit
// its own opening tag and only prefill an already-closed block when thinking
// is explicitly off. Must be derived per template, not assumed from backendKind.
function deriveStartsInReasoning(
  template: string,
  bosToken: string | undefined,
  eosToken: string | undefined,
  open: string,
): boolean {
  try {
    const rendered = new Template(template).render({
      messages: [{ role: 'user', content: 'probe' }],
      add_generation_prompt: true,
      bos_token: bosToken ?? '',
      eos_token: eosToken ?? '',
      enable_thinking: true,
    });
    return rendered.endsWith(open);
  } catch {
    return false; // safe default — never claim the prompt starts inside reasoning if we can't confirm it
  }
}
