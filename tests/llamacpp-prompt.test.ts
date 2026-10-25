import { describe, it, expect, vi } from 'vitest';
import { renderLlamaCppPrompt } from '@/ai/native-models/llamacpp-prompt';
import type { LanguageModelV3Prompt } from '@ai-sdk/provider';

const CHATML_TEMPLATE =
  '{% for message in messages %}<|im_start|>{{ message.role }}\n{{ message.content }}<|im_end|>\n{% endfor %}{% if add_generation_prompt %}<|im_start|>assistant\n{% endif %}';

function textMsg(role: 'user' | 'assistant', text: string) {
  return { role, content: [{ type: 'text' as const, text }] };
}

function mockFetch(propsBody: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => propsBody });
}

describe('renderLlamaCppPrompt', () => {
  it('renders using the server chat_template from /props', async () => {
    const fetchMock = mockFetch({ chat_template: CHATML_TEMPLATE, eos_token: '<|im_end|>' });
    const prompt: LanguageModelV3Prompt = [{ role: 'system', content: 'You are helpful.' }, textMsg('user', 'Hi')];

    const result = await renderLlamaCppPrompt(prompt, {
      rootURL: 'http://llama-template.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.promptText).toBe(
      '<|im_start|>system\nYou are helpful.<|im_end|>\n<|im_start|>user\nHi<|im_end|>\n<|im_start|>assistant\n',
    );
    expect(result.stopSequences).toEqual(['<|im_end|>']);
    expect(fetchMock).toHaveBeenCalledWith('http://llama-template.test/props', expect.anything());
  });

  it('falls back to generic ChatML when /props is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const prompt: LanguageModelV3Prompt = [textMsg('user', 'Hi')];

    const result = await renderLlamaCppPrompt(prompt, {
      rootURL: 'http://llama-unreachable.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.promptText).toBe('<|im_start|>user\nHi<|im_end|>\n<|im_start|>assistant\n');
    expect(result.stopSequences).toEqual(['<|im_end|>']);
  });

  it('falls back to generic ChatML when /props has no chat_template field', async () => {
    const fetchMock = mockFetch({ default_generation_settings: {} });
    const prompt: LanguageModelV3Prompt = [textMsg('user', 'Hi')];

    const result = await renderLlamaCppPrompt(prompt, {
      rootURL: 'http://llama-plain.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.promptText).toBe('<|im_start|>user\nHi<|im_end|>\n<|im_start|>assistant\n');
  });

  it('falls back to generic ChatML when the template fails to render', async () => {
    const fetchMock = mockFetch({ chat_template: '{% this is not valid jinja %}' });
    const prompt: LanguageModelV3Prompt = [textMsg('user', 'Hi')];

    const result = await renderLlamaCppPrompt(prompt, {
      rootURL: 'http://llama-broken-template.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.promptText).toBe('<|im_start|>user\nHi<|im_end|>\n<|im_start|>assistant\n');
  });

  it('appends a trailing assistant message verbatim as prefill, with no closing tag', async () => {
    const fetchMock = mockFetch({ chat_template: CHATML_TEMPLATE, eos_token: '<|im_end|>' });
    const prompt: LanguageModelV3Prompt = [textMsg('user', 'Say hi'), textMsg('assistant', 'Je voudrais')];

    const result = await renderLlamaCppPrompt(prompt, {
      rootURL: 'http://llama-prefill.test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.promptText).toBe('<|im_start|>user\nSay hi<|im_end|>\n<|im_start|>assistant\nJe voudrais');
  });

  it('caches /props per rootURL — a second render does not refetch', async () => {
    const fetchMock = mockFetch({ chat_template: CHATML_TEMPLATE, eos_token: '<|im_end|>' });
    const opts = { rootURL: 'http://llama-cached.test', fetch: fetchMock as unknown as typeof fetch };

    await renderLlamaCppPrompt([textMsg('user', 'a')], opts);
    await renderLlamaCppPrompt([textMsg('user', 'b')], opts);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
