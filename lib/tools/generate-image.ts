import { tool } from 'ai';
import { z } from 'zod';
import { rehostGeneratedImage } from '@/lib/generated-file-storage';

import { createLogger } from '@/lib/logger';

const log = createLogger('generate-image');

interface CustomProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
}

interface ToolContext {
  userPreferences?: Record<string, unknown>;
  userId?: string;
  chatId?: string;
}

export const generateImageTool = tool({
  description:
    'Generate an image from a text prompt using the user-configured image generation provider (Max subscribers only).',
  inputSchema: z.object({
    prompt: z.string().describe('Detailed image generation prompt describing what to create'),
    size: z.string().optional().describe('Image size, e.g. "1024x1024", "1792x1024", "1216x832"'),
    seed: z
      .number()
      .int()
      .optional()
      .describe(
        'Random seed. Omit for a different result every time (default) — only set this if the user explicitly asks to reuse or repeat a previous seed.',
      ),
  }),
  execute: async ({ prompt, size, seed }, { experimental_context }: { experimental_context?: unknown } = {}) => {
    const context = experimental_context as ToolContext | undefined;
    const prefs = context?.userPreferences ?? {};

    const providerId = prefs['zetora-image-gen-custom-provider-id'] as string | undefined;
    const model = (prefs['zetora-image-gen-model'] as string | undefined) || '';
    const customProviders = (prefs['zetora-custom-providers'] ?? []) as CustomProviderConfig[];
    const provider = customProviders.find((p) => p.id === providerId);

    if (!provider?.baseURL) {
      return {
        success: false as const,
        error: 'No image generation provider configured. Set one up in Settings → Image Generation.',
      };
    }

    let extraBody: Record<string, unknown> = {};
    try {
      extraBody = JSON.parse((prefs['zetora-image-gen-request-body'] as string | undefined) || '{}');
    } catch {
      extraBody = {};
    }

    const base = provider.baseURL.endsWith('/v1') ? provider.baseURL : `${provider.baseURL}/v1`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

    const finalSeed = seed ?? Math.floor(Math.random() * 2 ** 32);

    const body = { model, prompt, n: 1, seed: finalSeed, ...(size ? { size } : {}), ...extraBody };

    log.debug(`[generate_image] POST ${base}/images/generations`, JSON.stringify(body, null, 2));

    let response: Response;
    try {
      response = await fetch(`${base}/images/generations`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      return { success: false as const, error: `Could not reach image provider: ${(err as Error).message}` };
    }

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`[generate_image] ${response.status} response:`, errorText.slice(0, 2000));
      return {
        success: false as const,
        error: `Image generation failed (${response.status}): ${errorText.slice(0, 500)}`,
      };
    }

    const data = await response.json();
    log.debug('[generate_image] response:', JSON.stringify(data, null, 2).slice(0, 2000));
    const item = data?.data?.[0];
    const imageUrl: string | null = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);

    if (!imageUrl) {
      return { success: false as const, error: 'No image returned from the generation API.' };
    }

    const hostedImageUrl = await rehostGeneratedImage({
      userId: context?.userId,
      chatId: context?.chatId,
      sourceImageUrl: imageUrl,
      filenameHint: `generate-${finalSeed}`,
      toolName: 'generate_image',
    });

    return { success: true as const, imageUrl: hostedImageUrl, prompt, seed: finalSeed };
  },
});
