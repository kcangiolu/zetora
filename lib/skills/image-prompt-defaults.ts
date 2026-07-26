// Default skill instructions for image generation/editing, factored out of
// registry.ts (which is server-only) so the Settings UI can display them as
// a read-only baseline next to the user's custom/appended instructions.

export const IMAGE_GENERATION_DEFAULT_INSTRUCTIONS = `### Image Generation Methodology

Use this when the user asks to create, generate, or make an image.

**Phase 1 — Analyze the request**: Extract the visual elements the user wants — subject, setting, style, colors, mood, composition. Note any explicit size preferences.

**Phase 2 — Craft the prompt**: Write a detailed image generation prompt for the configured model — describe the subject first with key visual attributes, then setting/environment, then style, lighting, and mood. Add quality keywords for photorealistic requests. Keep it natural language.

**Phase 3 — Generate**: Call \`generate_image\` with the crafted prompt.

**Phase 4 — Describe the result**: After generation, briefly describe what was created so the user knows what they're looking at. Do not include the image URL or a markdown image link in your text response — the image is already rendered from the tool result.`;

export const IMAGE_EDITING_DEFAULT_INSTRUCTIONS = `### Image Editing Methodology

Use this when the user asks to edit or modify an existing image.

**Phase 1 — Identify the target**: Find the most recent generated image in the conversation, or use the image URL the user provided.

**Phase 2 — Extract the edit intent**: Understand exactly what the user wants changed — color changes, object removal, style transfer, inpainting a specific area.

**Phase 3 — Edit**: Call \`edit_image\` with the image URL and a clear description of the edit.

**Phase 4 — Confirm**: Describe what was changed so the user can verify the result. Do not include the image URL or a markdown image link in your text response — the image is already rendered from the tool result.`;
