import 'server-only';

import { generateText, type ImagePart } from 'ai';

import { ModelUnavailableError } from '@/ai/catalog/task-models';
import { getCatalogEntry } from '@/ai/catalog/store';
import { resolveModel } from '@/ai/providers';
import { fetchAttachment } from '@/lib/net/attachment-fetch';

// Image moderation is an instance policy: the administrator turns it on by
// naming a vision model in ZETORA_MODEL_IMAGE_MODERATION, and users cannot
// change or bypass it. Left empty, images are not moderated.
const MODERATION_ENV_KEY = 'ZETORA_MODEL_IMAGE_MODERATION';

const MODERATION_SYSTEM_PROMPT = `You are an image safety classifier. Decide whether any of the images contains:
- sexual content involving minors;
- sexual content or nudity;
- graphic violence or gore;
- content that encourages self-harm;
- hateful symbols or imagery that targets people for who they are;
- instructions or depictions of weapons built to cause mass harm.

Answer with exactly one line:
- safe
- unsafe: <the category, in a few words>
Write nothing else.`;

export type ImageModerationVerdict = { safe: true } | { safe: false; category: string };

// The instance's moderation model, or undefined when moderation is off.
// Throws when the variable names a model that cannot moderate images.
export function getImageModerationModelId(): string | undefined {
  const configured = process.env[MODERATION_ENV_KEY]?.trim();
  if (!configured) return undefined;

  const entry = getCatalogEntry(configured);
  if (!entry) {
    throw new ModelUnavailableError(
      `Image moderation: ${MODERATION_ENV_KEY}=${configured} is not available. It is not in the model catalog, or its provider has no API key.`,
    );
  }
  if (!entry.vision) {
    throw new ModelUnavailableError(
      `Image moderation: ${MODERATION_ENV_KEY}=${configured} cannot read images. Set it to a model with vision.`,
    );
  }
  return entry.id;
}

// Reads the classifier's answer. Dedicated guard models (Llama Guard) answer
// "unsafe" and the category on the next line, chat models "unsafe: category";
// both are accepted. Any other answer is an error, never a pass.
export function parseModerationAnswer(answer: string): ImageModerationVerdict {
  const [firstLine = '', ...rest] = answer.trim().split('\n');
  const match = /^[\s*`"']*(safe|unsafe)\b[\s*`"'.:]*(.*)$/i.exec(firstLine.trim());
  if (!match) {
    throw new Error(`The moderation model gave an unexpected answer: ${answer.trim().slice(0, 200)}`);
  }
  if (match[1].toLowerCase() === 'safe') return { safe: true };

  const category = (match[2] || rest.join(' ')).trim();
  return { safe: false, category: category || 'unspecified' };
}

/**
 * Checks images with the instance's moderation model. The images are
 * downloaded and sent as bytes: the storage host is geo-restricted, so a
 * provider fetching a URL itself may not reach it.
 */
export async function moderateImages(
  modelId: string,
  imageUrls: string[],
  abortSignal?: AbortSignal,
): Promise<ImageModerationVerdict> {
  const images = await Promise.all(
    imageUrls.map(async (url): Promise<ImagePart> => {
      const { bytes, contentType } = await fetchAttachment(url);
      return { type: 'image', image: bytes, mediaType: contentType };
    }),
  );

  const { text } = await generateText({
    model: await resolveModel(modelId, null, undefined, true),
    system: MODERATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: images }],
    abortSignal,
  });
  return parseModerationAnswer(text);
}
