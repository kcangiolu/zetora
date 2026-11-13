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

  it('names the attached files, so the model titles the message instead of answering it', async () => {
    getCachedUserPreferencesByUserId.mockResolvedValue({ preferences: {} });
    const withImage = {
      id: 'm2',
      role: 'user',
      parts: [
        { type: 'text', text: 'What is written in this image?' },
        { type: 'file', mediaType: 'image/png', filename: 'receipt.png', url: 'https://example.com/receipt.png' },
        { type: 'file', mediaType: 'application/pdf', url: 'https://example.com/a.pdf' },
      ],
    } as UIMessage;

    await generateTitleFromUserMessage({ message: withImage, userId: 'user-1' });

    const call = generateText.mock.calls[0][0];
    expect(call.messages).toEqual([
      {
        role: 'user',
        content: '"What is written in this image?"\n\nAttached files: receipt.png, application/pdf',
      },
    ]);
    expect(call.system).toContain('never answer it');
  });

  it('sends the text alone when nothing is attached', async () => {
    getCachedUserPreferencesByUserId.mockResolvedValue({ preferences: {} });

    await generateTitleFromUserMessage({ message, userId: 'user-1' });

    expect(generateText.mock.calls[0][0].messages[0].content).toBe('"Comment planifier un déploiement ?"');
  });
});
