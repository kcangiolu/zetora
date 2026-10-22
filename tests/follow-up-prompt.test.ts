import { describe, it, expect } from 'vitest';

import { buildFollowUpRequest } from '@/lib/search/follow-up-prompt';

describe('buildFollowUpRequest', () => {
  it('puts the whole exchange in one request, labelled by speaker', () => {
    const request = buildFollowUpRequest([
      { role: 'user', content: ' What is the capital of Peru? ' },
      { role: 'assistant', content: 'Lima.' },
    ]);
    expect(request).toBe(
      'Here is the conversation:\n\nUser: What is the capital of Peru?\n\nAssistant: Lima.\n\nWrite the follow-up questions for it.',
    );
  });
});
