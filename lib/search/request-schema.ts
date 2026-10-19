import { z } from 'zod';

// Fields every request must get right; the rest are optional switches. Message parts
// are checked where they are used.
export const searchRequestSchema = z
  .object({
    id: z.string().min(1),
    messages: z
      .array(
        z
          .object({ id: z.string(), role: z.enum(['user', 'assistant', 'system']), parts: z.array(z.unknown()) })
          .passthrough(),
      )
      .min(1, 'Messages array is required and cannot be empty')
      .max(1000),
    model: z.string().min(1, 'A model is required'),
    group: z.string().nullish(),
    timezone: z.string().nullish(),
    selectedVisibilityType: z.enum(['public', 'private']).nullish(),
    isCustomInstructionsEnabled: z.boolean().nullish(),
    sessionEnabledSources: z.array(z.string()).nullish(),
    isTemporaryChat: z.boolean().nullish(),
    isAutoRouted: z.boolean().nullish(),
    autoRouterEnabled: z.boolean().nullish(),
    autoRouterConfig: z
      .object({ routes: z.array(z.object({ name: z.string(), description: z.string(), model: z.string() })) })
      .nullish(),
    visionEnabled: z.boolean().nullish(),
    reasoningEffort: z.enum(['auto', 'low', 'medium', 'high', 'off']).nullish(),
    startWith: z.string().nullish(),
  })
  .passthrough();
