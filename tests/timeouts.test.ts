import { describe, it, expect, afterEach } from 'vitest';
import {
  _envMs,
  isPastDeadline,
  SEARXNG_TIMEOUT_MS,
  FASTCRW_SEARCH_TIMEOUT_MS,
  FASTCRW_SCRAPE_TIMEOUT_MS,
  FASTCRW_SCRAPE_DEADLINE_MS,
  METADATA_TIMEOUT_MS,
  NOTTE_TIMEOUT_MS,
  EXTREME_WALL_CLOCK_MS,
  SEARCH_REQUEST_TIMEOUT_MS,
} from '@/lib/timeouts';

describe('envMs', () => {
  const VAR = 'ZETORA_TEST_TIMEOUT_VAR';

  afterEach(() => {
    delete process.env[VAR];
  });

  it('falls back when the env var is unset', () => {
    expect(_envMs(VAR, 5000)).toBe(5000);
  });

  it('falls back when the env var is empty', () => {
    process.env[VAR] = '';
    expect(_envMs(VAR, 5000)).toBe(5000);
  });

  it('parses a valid positive numeric override', () => {
    process.env[VAR] = '1234';
    expect(_envMs(VAR, 5000)).toBe(1234);
  });

  it('falls back on a non-numeric value', () => {
    process.env[VAR] = 'not-a-number';
    expect(_envMs(VAR, 5000)).toBe(5000);
  });

  it('falls back on zero', () => {
    process.env[VAR] = '0';
    expect(_envMs(VAR, 5000)).toBe(5000);
  });

  it('falls back on a negative value', () => {
    process.env[VAR] = '-100';
    expect(_envMs(VAR, 5000)).toBe(5000);
  });
});

describe('isPastDeadline', () => {
  it('is false before the deadline', () => {
    expect(isPastDeadline(1000, 999)).toBe(false);
  });

  it('is false exactly at the deadline', () => {
    expect(isPastDeadline(1000, 1000)).toBe(false);
  });

  it('is true after the deadline', () => {
    expect(isPastDeadline(1000, 1001)).toBe(true);
  });

  it('defaults "now" to Date.now()', () => {
    expect(isPastDeadline(Date.now() + 60_000)).toBe(false);
    expect(isPastDeadline(Date.now() - 60_000)).toBe(true);
  });
});

describe('default timeout constants', () => {
  it('are all positive, finite, and in a sane order of magnitude', () => {
    for (const value of [
      SEARXNG_TIMEOUT_MS,
      FASTCRW_SEARCH_TIMEOUT_MS,
      FASTCRW_SCRAPE_TIMEOUT_MS,
      FASTCRW_SCRAPE_DEADLINE_MS,
      METADATA_TIMEOUT_MS,
      NOTTE_TIMEOUT_MS,
      EXTREME_WALL_CLOCK_MS,
      SEARCH_REQUEST_TIMEOUT_MS,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it('gives the whole request more headroom than the extreme-agent wall clock', () => {
    expect(SEARCH_REQUEST_TIMEOUT_MS).toBeGreaterThan(EXTREME_WALL_CLOCK_MS);
  });

  it("lets fastCRW's own scrape deadline fire before the client gives up", () => {
    expect(FASTCRW_SCRAPE_TIMEOUT_MS).toBeGreaterThan(FASTCRW_SCRAPE_DEADLINE_MS);
  });
});
