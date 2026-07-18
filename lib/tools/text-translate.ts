import { Output, tool, generateText } from 'ai';
import { z } from 'zod';
import { resolveTertiaryModel } from '@/ai/tertiary';

import { createLogger } from '@/lib/logger';

const log = createLogger('text-translate');

interface TextTranslateToolInput {
  text?: string;
  to: string;
  from?: string;
}

interface TextTranslateToolOutput {
  translatedText: string;
  detectedLanguage: string;
}

interface ImageContext {
  url: unknown; // Can be URL, string, Uint8Array, etc. from AI SDK's DataContent
  contentType?: string;
  name?: string;
}

interface ToolContext {
  images?: ImageContext[];
  userPreferences?: Record<string, string>;
}

const TRANSLATEGEMMA_PROMPT_TEMPLATE = `You are a professional {SOURCE_LANG} to {TARGET_LANG} translator.

Translate the MEANING of the following text into {TARGET_LANG}. Do NOT transliterate - translate what the words MEAN.

Output only the {TARGET_LANG} translation.

{TEXT}`;

const TRANSLATEGEMMA_IMAGE_PROMPT_TEMPLATE = `Translate the text in this image to {TARGET_LANG}. Reply with ONLY the translation. No explanations. No phonetic spelling. No transliterations. Just the meaning in {TARGET_LANG}.`;

function normalizeLanguageCode(languageCode: string): string {
  const normalized = languageCode.trim().toLowerCase();
  const primary = normalized.split(/[-_]/)[0] || normalized;
  return primary;
}

function getLanguageName(languageCode: string): string {
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    return displayNames.of(languageCode) || languageCode;
  } catch {
    return languageCode;
  }
}

function renderTranslateGemmaPrompt(args: {
  sourceLanguageName: string;
  sourceLanguageCode: string;
  targetLanguageName: string;
  targetLanguageCode: string;
  text: string;
}): string {
  return TRANSLATEGEMMA_PROMPT_TEMPLATE.replaceAll('{SOURCE_LANG}', args.sourceLanguageName)
    .replaceAll('{SOURCE_CODE}', args.sourceLanguageCode)
    .replaceAll('{TARGET_LANG}', args.targetLanguageName)
    .replaceAll('{TARGET_CODE}', args.targetLanguageCode)
    .replaceAll('{TEXT}', args.text);
}

function renderTranslateGemmaImagePrompt(args: {
  sourceLanguageName: string;
  sourceLanguageCode: string;
  targetLanguageName: string;
  targetLanguageCode: string;
}): string {
  return TRANSLATEGEMMA_IMAGE_PROMPT_TEMPLATE.replaceAll('{SOURCE_LANG}', args.sourceLanguageName)
    .replaceAll('{SOURCE_CODE}', args.sourceLanguageCode)
    .replaceAll('{TARGET_LANG}', args.targetLanguageName)
    .replaceAll('{TARGET_CODE}', args.targetLanguageCode);
}

const detectedLanguageSchema = z.object({
  detectedLanguage: z.string().describe('ISO 639-1 language code (2-letter).'),
});

async function detectLanguageCode(text: string, preferences: Record<string, string> | null): Promise<string> {
  try {
    const { output } = await generateText({
      model: await resolveTertiaryModel('lang-detect', preferences),
      output: Output.object({ schema: detectedLanguageSchema }),
      prompt: `Detect the ISO 639-1 language code (2-letter) of the following text.\n\nText:\n${text}`,
      temperature: 0,
    });

    return normalizeLanguageCode(output.detectedLanguage) || 'auto';
  } catch {
    return 'auto';
  }
}

export const textTranslateTool = tool({
  description: 'Translate text from one language to another. Can also extract and translate text from images.',
  inputSchema: z.object({
    text: z
      .string()
      .describe('The text to translate. If empty and images are provided, text will be extracted from images first.'),
    to: z.string().describe('The language to translate to in the format of ISO 639-1.'),
    from: z.string().optional().describe('Optional source language ISO 639-1 code. If omitted, it will be detected.'),
  }),
  execute: async (
    { text, to, from }: TextTranslateToolInput,
    { experimental_context },
  ): Promise<TextTranslateToolOutput> => {
    log.debug('[text-translate] Starting translation...');
    log.debug('[text-translate] Input:', { text: text?.substring(0, 100), to, from });

    const context = experimental_context as ToolContext | undefined;
    const images = context?.images ?? [];
    const hasImages = images.length > 0;
    const translatePrefs = (context?.userPreferences ?? null) as Record<string, string> | null;
    log.debug('[text-translate] Has images:', hasImages, 'Image count:', images.length);

    const targetLanguageCode = normalizeLanguageCode(to);
    log.debug('[text-translate] Target language code:', targetLanguageCode);

    // Detect source language from text if provided
    const detectedLanguage = from
      ? normalizeLanguageCode(from)
      : text && text.trim() !== ''
        ? await detectLanguageCode(text, translatePrefs)
        : 'auto';
    log.debug('[text-translate] Detected source language:', detectedLanguage);

    // If we have images, pass them directly to TranslateGemma (vision model)
    if (hasImages) {
      log.debug('[text-translate] Processing with images...');

      // Build the image-specific prompt
      const imagePromptText = renderTranslateGemmaImagePrompt({
        sourceLanguageName: detectedLanguage === 'auto' ? 'Auto-detected' : getLanguageName(detectedLanguage),
        sourceLanguageCode: detectedLanguage,
        targetLanguageName: getLanguageName(targetLanguageCode),
        targetLanguageCode,
      });
      log.debug('[text-translate] Image prompt built:', imagePromptText);

      log.debug('[text-translate] Calling model with', images.length, 'images...');
      const { text: translatedText } = await generateText({
        model: await resolveTertiaryModel('translate-vision', translatePrefs),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: imagePromptText },
              ...images.map((img) => ({
                type: 'image' as const,
                image: img.url as string,
              })),
            ],
          },
        ],
        temperature: 0,
      });
      log.debug('[text-translate] Image translation complete. Result length:', translatedText.length);
      log.debug('[text-translate] Image translation result:', translatedText.substring(0, 200));

      return {
        translatedText: translatedText.trim(),
        detectedLanguage,
      };
    }

    // Build the text prompt for text-only translation
    const promptText = renderTranslateGemmaPrompt({
      sourceLanguageName: detectedLanguage === 'auto' ? 'Auto-detected' : getLanguageName(detectedLanguage),
      sourceLanguageCode: detectedLanguage,
      targetLanguageName: getLanguageName(targetLanguageCode),
      targetLanguageCode,
      text: text || '',
    });
    log.debug('[text-translate] Text prompt built:', promptText.substring(0, 200));

    // Text-only translation
    if (!text || text.trim() === '') {
      log.debug('[text-translate] Error: No text provided');
      throw new Error('No text to translate. Please provide text or an image containing text.');
    }

    log.debug('[text-translate] Calling TranslateGemma for text-only translation...');
    const { text: translatedText } = await generateText({
      model: await resolveTertiaryModel('translate-text', translatePrefs),
      prompt: promptText,
      temperature: 0,
    });
    log.debug('[text-translate] Text translation complete. Result length:', translatedText.length);
    log.debug('[text-translate] Translation result:', translatedText.substring(0, 200));

    return {
      translatedText: translatedText.trim(),
      detectedLanguage,
    };
  },
});
