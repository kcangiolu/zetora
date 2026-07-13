import { tool } from 'ai';
import { z } from 'zod';

interface CustomProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
}

interface ToolContext {
  userPreferences?: Record<string, unknown>;
}

export const editImageTool = tool({
  description:
    'Edit an existing image — change colors, add/remove objects, inpaint, or modify specific elements (Max subscribers only). Use the URL of an image already shown in the conversation (generated or uploaded).',
  inputSchema: z.object({
    image_url: z.string().describe('URL of the image to edit'),
    prompt: z.string().describe('Description of the edit to apply to the image'),
  }),
  execute: async ({ image_url, prompt }, { experimental_context }: { experimental_context?: unknown } = {}) => {
    const prefs = (experimental_context as ToolContext | undefined)?.userPreferences ?? {};

    const providerId = prefs['zetora-image-edit-custom-provider-id'] as string | undefined;
    const model = (prefs['zetora-image-edit-model'] as string | undefined) || '';
    const customProviders = (prefs['zetora-custom-providers'] ?? []) as CustomProviderConfig[];
    const provider = customProviders.find((p) => p.id === providerId);

    if (!provider?.baseURL) {
      return {
        success: false as const,
        error: 'No image editing provider configured. Set one up in Settings → Image Editing.',
      };
    }

    let extraBody: Record<string, string> = {};
    try {
      extraBody = JSON.parse((prefs['zetora-image-edit-request-body'] as string | undefined) || '{}');
    } catch {
      extraBody = {};
    }

    let sourceImage: Response;
    try {
      sourceImage = await fetch(image_url, { signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      return { success: false as const, error: `Could not download source image: ${(err as Error).message}` };
    }
    if (!sourceImage.ok) {
      return { success: false as const, error: `Could not download source image: ${sourceImage.status}` };
    }

    const formData = new FormData();
    formData.append('image', await sourceImage.blob(), 'image.png');
    formData.append('prompt', prompt);
    formData.append('model', model);
    formData.append('n', '1');
    for (const [key, value] of Object.entries(extraBody)) {
      formData.append(key, value);
    }

    const base = provider.baseURL.endsWith('/v1') ? provider.baseURL : `${provider.baseURL}/v1`;
    const headers: Record<string, string> = {};
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

    let response: Response;
    try {
      response = await fetch(`${base}/images/edits`, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      return { success: false as const, error: `Could not reach image provider: ${(err as Error).message}` };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false as const, error: `Image editing failed (${response.status}): ${errorText.slice(0, 500)}` };
    }

    const data = await response.json();
    const item = data?.data?.[0];
    const imageUrl: string | null = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);

    if (!imageUrl) {
      return { success: false as const, error: 'No image returned from the editing API.' };
    }

    return { success: true as const, imageUrl, originalUrl: image_url, prompt };
  },
});
