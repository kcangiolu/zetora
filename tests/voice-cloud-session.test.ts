import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveVoiceS2SBackend } from '@/lib/s2s-backends';

const { getUser, serverEnv } = vi.hoisted(() => ({
  getUser: vi.fn(),
  serverEnv: { XAI_API_KEY: 'xai-test-key' },
}));

vi.mock('@/lib/auth-utils', () => ({ getUser }));
vi.mock('@/env/server', () => ({ serverEnv }));

import { POST } from '@/app/api/voice/cloud-session/route';

const ctx = { params: Promise.resolve({}) };
const request = () => new Request('http://localhost/api/voice/cloud-session', { method: 'POST' });

describe('POST /api/voice/cloud-session', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    getUser.mockResolvedValue({ id: 'user-1' });
    serverEnv.XAI_API_KEY = 'xai-test-key';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mints a short-lived xAI token with the server key and returns only the token', async () => {
    fetchMock.mockResolvedValue(Response.json({ value: 'ephemeral-1', expires_at: 1_900_000_000 }));

    const response = await POST(request(), ctx);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: 'ephemeral-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.x.ai/v1/realtime/client_secrets');
    expect(init.headers.Authorization).toBe('Bearer xai-test-key');
    expect(JSON.parse(init.body)).toEqual({ expires_after: { seconds: 300 } });
  });

  it('rejects signed-out callers without calling xAI', async () => {
    getUser.mockResolvedValue(null);

    const response = await POST(request(), ctx);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('names XAI_API_KEY when the instance has no key', async () => {
    serverEnv.XAI_API_KEY = 'placeholder';

    const response = await POST(request(), ctx);

    expect(response.status).toBe(400);
    expect((await response.json()).cause).toContain('XAI_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the xAI error body out of the response', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"team out of credits"}', { status: 403 }));

    const response = await POST(request(), ctx);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.cause).toContain('403');
    expect(JSON.stringify(body)).not.toContain('credits');
  });
});

describe('resolveVoiceS2SBackend', () => {
  it('keeps the preferred backend when the instance has it', () => {
    expect(resolveVoiceS2SBackend('local', { cloudVoice: true, localVoice: true })).toBe('local');
  });

  it('falls back to the backend the instance has', () => {
    expect(resolveVoiceS2SBackend('cloud', { cloudVoice: false, localVoice: true })).toBe('local');
    expect(resolveVoiceS2SBackend('local', { cloudVoice: true, localVoice: false })).toBe('cloud');
  });

  it('returns null when the instance has no voice backend', () => {
    expect(resolveVoiceS2SBackend('cloud', { cloudVoice: false, localVoice: false })).toBeNull();
  });
});
