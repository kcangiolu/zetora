import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupadataError } from '@supadata/js';
import { createSupadataCaller } from '@/lib/tools/supadata-caller';

const rateLimited = () => new SupadataError({ error: 'limit-exceeded', message: 'Limit Exceeded' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createSupadataCaller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs no more calls at once than its slots', async () => {
    const call = createSupadataCaller({ deadlineMs: Date.now() + 60_000, concurrency: 2 });
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    let running = 0;
    let peak = 0;

    const results = gates.map((gate, index) =>
      call(`call ${index}`, async () => {
        running++;
        peak = Math.max(peak, running);
        const value = await gate.promise;
        running--;
        return value;
      }),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(running).toBe(2);
    gates.forEach((gate, index) => gate.resolve(`v${index}`));

    expect(await Promise.all(results)).toEqual(['v0', 'v1', 'v2']);
    expect(peak).toBe(2);
  });

  it('retries a rate-limited call after backing off', async () => {
    const call = createSupadataCaller({ deadlineMs: Date.now() + 60_000, rateLimitBackoffMs: 1_000 });
    const fn = vi.fn().mockRejectedValueOnce(rateLimited()).mockResolvedValueOnce('ok');

    const result = call('transcript', fn);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up once the rate-limit retries are spent', async () => {
    const call = createSupadataCaller({ deadlineMs: Date.now() + 60_000, rateLimitRetries: 1 });
    const fn = vi.fn().mockRejectedValue(rateLimited());

    const result = expect(call('transcript', fn)).rejects.toBeInstanceOf(SupadataError);
    await vi.advanceTimersByTimeAsync(5_000);

    await result;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors', async () => {
    const call = createSupadataCaller({ deadlineMs: Date.now() + 60_000 });
    const fn = vi.fn().mockRejectedValue(new SupadataError({ error: 'not-found' }));

    await expect(call('metadata', fn)).rejects.toBeInstanceOf(SupadataError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops waiting for a call past its timeout', async () => {
    const call = createSupadataCaller({ deadlineMs: Date.now() + 60_000, callTimeoutMs: 5_000 });

    const result = expect(call('transcript', () => new Promise(() => {}))).rejects.toThrow(
      'Supadata transcript timed out',
    );
    await vi.advanceTimersByTimeAsync(5_000);

    await result;
  });

  it('caps a call at the time left before the deadline', async () => {
    const call = createSupadataCaller({ deadlineMs: Date.now() + 2_000, callTimeoutMs: 20_000 });

    const result = expect(call('transcript', () => new Promise(() => {}))).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(2_000);

    await result;
  });

  it('fails queued calls without running them once the deadline has passed', async () => {
    const call = createSupadataCaller({ deadlineMs: Date.now() + 1_000 });
    await vi.advanceTimersByTimeAsync(1_001);
    const fn = vi.fn().mockResolvedValue('late');

    await expect(call('transcript', fn)).rejects.toThrow('time budget spent');
    expect(fn).not.toHaveBeenCalled();
  });
});
