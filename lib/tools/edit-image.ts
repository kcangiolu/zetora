import { tool } from 'ai';
import { z } from 'zod';
import { rehostGeneratedImage } from '@/lib/generated-file-storage';
import { fetchCustomProvider } from '@/lib/custom-providers';
import { fetchAttachment } from '@/lib/net/attachment-fetch';

import { createLogger } from '@/lib/logger';
import type { UserPreferenceValues } from '@/lib/db/schema';

const log = createLogger('edit-image');

interface CustomProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
}

interface ToolContext {
  userPreferences?: UserPreferenceValues;
  userId?: string;
  chatId?: string;
  images?: { url: string; contentType: string; name?: string }[];
}

export const editImageTool = tool({
  description:
    'Edit an existing image — change colors, add/remove objects, inpaint, or modify specific elements. Use the URL of an image already shown in the conversation (generated or uploaded).',
  inputSchema: z.object({
    image_url: z
      .string()
      .optional()
      .describe('URL of the image to edit. Omit to default to the most recently uploaded image in the conversation.'),
    prompt: z.string().describe('Description of the edit to apply to the image'),
    seed: z
      .number()
      .int()
      .optional()
      .describe(
        'Random seed. Omit for a different result every time (default) — only set this if the user explicitly asks to reuse or repeat a previous seed.',
      ),
  }),
  execute: async ({ image_url, prompt, seed }, { experimental_context }: { experimental_context?: unknown } = {}) => {
    const context = experimental_context as ToolContext | undefined;
    const prefs = context?.userPreferences ?? {};

    const resolvedImageUrl = image_url || context?.images?.at(-1)?.url;
    if (!resolvedImageUrl) {
      return { success: false as const, error: 'No image to edit — attach an image first.' };
    }

    const providerId = prefs['zetora-image-edit-custom-provider-id'];
    const model = prefs['zetora-image-edit-model'] || '';
    const customProviders = (prefs['zetora-custom-providers'] ?? []) as CustomProviderConfig[];
    const provider = customProviders.find((p) => p.id === providerId);

    if (!provider?.baseURL) {
      return {
        success: false as const,
        error: 'No image editing provider configured. Set one up in Settings → Image Editing.',
      };
    }

    let extraBody: Record<string, unknown>;
    try {
      extraBody = JSON.parse(prefs['zetora-image-edit-request-body'] || '{}');
    } catch {
      return {
        success: false as const,
        error: 'The extra request body in Settings → Image Editing is not valid JSON.',
      };
    }

    let sourceImage: Awaited<ReturnType<typeof fetchAttachment>>;
    try {
      sourceImage = await fetchAttachment(resolvedImageUrl);
    } catch (err) {
      return { success: false as const, error: `Could not download source image: ${(err as Error).message}` };
    }

    const finalSeed = seed ?? Math.floor(Math.random() * 2 ** 32);

    const formData = new FormData();
    formData.append('image', new Blob([sourceImage.bytes], { type: sourceImage.contentType }), 'image.png');
    formData.append('prompt', prompt);
    formData.append('model', model);
    formData.append('n', '1');
    formData.append('seed', String(finalSeed));
    for (const [key, value] of Object.entries(extraBody)) {
      formData.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    }

    const base = provider.baseURL.endsWith('/v1') ? provider.baseURL : `${provider.baseURL}/v1`;
    const headers: Record<string, string> = {};
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

    log.debug(
      `[edit_image] POST ${base}/images/edits`,
      JSON.stringify({ prompt, model, n: '1', seed: finalSeed, ...extraBody }, null, 2),
      '+ image blob',
    );

    let response: Response;
    try {
      response = await fetchCustomProvider(`${base}/images/edits`, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(300_000),
      });
    } catch (err) {
      return { success: false as const, error: `Could not reach image provider: ${(err as Error).message}` };
    }

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`[edit_image] ${response.status} response:`, errorText.slice(0, 2000));
      return {
        success: false as const,
        error: `Image editing failed (${response.status}): ${errorText.slice(0, 500)}`,
      };
    }

    const data = await response.json();
    log.debug('[edit_image] response:', JSON.stringify(data, null, 2).slice(0, 2000));
    const item = data?.data?.[0];
    const imageUrl: string | null = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);

    if (!imageUrl) {
      return { success: false as const, error: 'No image returned from the editing API.' };
    }

    const hostedImageUrl = await rehostGeneratedImage({
      userId: context?.userId,
      chatId: context?.chatId,
      sourceImageUrl: imageUrl,
      filenameHint: `edit-${finalSeed}`,
      toolName: 'edit_image',
    });

    return { success: true as const, imageUrl: hostedImageUrl, originalUrl: resolvedImageUrl, prompt, seed: finalSeed };
  },
});
