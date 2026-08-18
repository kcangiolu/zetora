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
