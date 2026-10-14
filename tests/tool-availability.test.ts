import { afterEach, describe, it, expect, vi } from 'vitest';

// A tool whose API key is missing is never offered to the model.

async function loadCapabilities(env: Record<string, string>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return import('@/lib/instance/capabilities');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isToolAvailable', () => {
  it('hides a keyed tool whose key is the placeholder', async () => {
    const { isToolAvailable } = await loadCapabilities({ TMDB_API_KEY: 'placeholder', OPENWEATHER_API_KEY: '' });
    expect(isToolAvailable('movie_or_tv_search')).toBe(false);
    expect(isToolAvailable('get_weather_data')).toBe(false);
  });

  it('offers a keyed tool once its key is set, and needs every key of a pair', async () => {
    const { isToolAvailable } = await loadCapabilities({
      TMDB_API_KEY: 'tmdb-key',
      AMADEUS_API_KEY: 'amadeus-key',
      AMADEUS_API_SECRET: 'placeholder',
    });
    expect(isToolAvailable('movie_or_tv_search')).toBe(true);
    expect(isToolAvailable('track_flight')).toBe(false);
  });

  it('offers tools that need no key', async () => {
    const { isToolAvailable } = await loadCapabilities({});
    expect(isToolAvailable('datetime')).toBe(true);
  });
});
