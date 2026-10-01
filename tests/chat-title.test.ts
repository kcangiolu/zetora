import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UIMessage } from 'ai';

const { generateText, resolveTertiaryModel, getCachedUserPreferencesByUserId } = vi.hoisted(() => ({
  generateText: vi.fn(),
  resolveTertiaryModel: vi.fn().mockResolvedValue('mock-model'),
  getCachedUserPreferencesByUserId: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateText };
});
vi.mock('@/ai/tertiary', () => ({ resolveTertiaryModel }));
vi.mock('@/lib/user-data-server', () => ({ getCachedUserPreferencesByUserId }));

import { generateTitleFromUserMessage, UNTITLED_CHAT_TITLE } from '@/lib/search/chat-title';

const message = {
  id: 'm1',
  role: 'user',
  parts: [{ type: 'text', text: 'Comment planifier un déploiement ?' }],
} as UIMessage;

describe('generateTitleFromUserMessage', () => {
  beforeEach(() => {
    generateText.mockReset();
    getCachedUserPreferencesByUserId.mockReset();
    generateText.mockResolvedValue({ text: 'Planifier un déploiement' });
  });

  it("reads the given user's preferences and skips the model call when titles are disabled", async () => {
    getCachedUserPreferencesByUserId.mockResolvedValue({
      preferences: { 'zetora-tertiary-chat-title-enabled': false },
    });

    const title = await generateTitleFromUserMessage({ message, userId: 'user-1' });

    expect(getCachedUserPreferencesByUserId).toHaveBeenCalledWith('user-1');
    expect(title).toBe(UNTITLED_CHAT_TITLE);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('generates a title when the preference is unset', async () => {
    getCachedUserPreferencesByUserId.mockResolvedValue({ preferences: {} });

    const title = await generateTitleFromUserMessage({ message, userId: 'user-1' });

    expect(title).toBe('Planifier un déploiement');
    expect(resolveTertiaryModel).toHaveBeenCalledWith('chat-title', {}, 'user-1');
  });
});
