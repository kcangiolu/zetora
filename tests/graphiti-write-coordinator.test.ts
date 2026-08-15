import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getKVRedisClient } = vi.hoisted(() => ({
  getKVRedisClient: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ getKVRedisClient }));

import {
  withMemoryWriteLock,
  isDuplicateOfRecentWrite,
  recordRecentWrite,
} from '@/lib/graphiti/write-coordinator';

function createRedisMock() {
  const multiChain = {
    lpush: vi.fn().mockReturnThis(),
    ltrim: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  return {
    set: vi.fn(),
    eval: vi.fn().mockResolvedValue(1),
    lrange: vi.fn().mockResolvedValue([]),
    multi: vi.fn().mockReturnValue(multiChain),
    __multiChain: multiChain,
  };
}

describe('withMemoryWriteLock', () => {
  beforeEach(() => {
    getKVRedisClient.mockReset();
  });

  it('serializes calls locally when Redis is not configured', async () => {
    getKVRedisClient.mockReturnValue(null);

    const order: string[] = [];
    let active = 0;
    let concurrentOverlap = false;

    const run = (id: string) =>
      withMemoryWriteLock('user-1', async () => {
        active++;
        if (active > 1) concurrentOverlap = true;
        order.push(`start-${id}`);
        await new Promise((r) => setTimeout(r, 10));
        order.push(`end-${id}`);
        active--;
      });

    await Promise.all([run('a'), run('b')]);

    expect(concurrentOverlap).toBe(false);
    expect(order).toEqual(['start-a', 'end-a', 'start-b', 'end-b']);
  });

  it('does not serialize across different groupIds', async () => {
    getKVRedisClient.mockReturnValue(null);

    let active = 0;
    let concurrentOverlap = false;

    const run = (groupId: string) =>
      withMemoryWriteLock(groupId, async () => {
        active++;
        if (active > 1) concurrentOverlap = true;
        await new Promise((r) => setTimeout(r, 10));
        active--;
      });

    await Promise.all([run('user-1'), run('user-2')]);

    expect(concurrentOverlap).toBe(true);
  });

  it('acquires the Redis lock, runs fn, then releases it via the compare-and-delete script', async () => {
    const redis = createRedisMock();
    redis.set.mockResolvedValue('OK');
    getKVRedisClient.mockReturnValue(redis);

    const fn = vi.fn().mockResolvedValue('done');
    const result = await withMemoryWriteLock('user-1', fn);

    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith('graphiti:lock:user-1', expect.any(String), 'PX', expect.any(Number), 'NX');
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'graphiti:lock:user-1', expect.any(String));
  });

  it('releases the lock even when fn throws', async () => {
    const redis = createRedisMock();
    redis.set.mockResolvedValue('OK');
    getKVRedisClient.mockReturnValue(redis);

    await expect(withMemoryWriteLock('user-1', async () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );

    expect(redis.eval).toHaveBeenCalledTimes(1);
  });

  it('proceeds unlocked once the wait deadline passes instead of hanging forever', async () => {
    vi.useFakeTimers();
    try {
      const redis = createRedisMock();
      redis.set.mockResolvedValue(null); // lock always held by someone else
      getKVRedisClient.mockReturnValue(redis);

      const fn = vi.fn().mockResolvedValue('ran-unlocked');
      const promise = withMemoryWriteLock('user-1', fn);

      await vi.advanceTimersByTimeAsync(210_000);

      await expect(promise).resolves.toBe('ran-unlocked');
      expect(fn).toHaveBeenCalledTimes(1);
      // Never acquired, so it must never attempt to release.
      expect(redis.eval).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);
});

describe('isDuplicateOfRecentWrite', () => {
  beforeEach(() => {
    getKVRedisClient.mockReset();
  });

  it('returns false when Redis is not configured', async () => {
    getKVRedisClient.mockReturnValue(null);
    await expect(isDuplicateOfRecentWrite('user-1', "User's dog is named Rex")).resolves.toBe(false);
  });

  it('flags a near-duplicate of a recently written memory', async () => {
    const redis = createRedisMock();
    redis.lrange.mockResolvedValue([JSON.stringify({ text: 'User has a dog called Rex', ts: Date.now() })]);
    getKVRedisClient.mockReturnValue(redis);

    await expect(isDuplicateOfRecentWrite('user-1', "User's dog is named Rex")).resolves.toBe(true);
  });

  it('does not flag an unrelated recent memory', async () => {
    const redis = createRedisMock();
    redis.lrange.mockResolvedValue([JSON.stringify({ text: 'User works as a nurse in Lyon', ts: Date.now() })]);
    getKVRedisClient.mockReturnValue(redis);

    await expect(isDuplicateOfRecentWrite('user-1', "User's dog is named Rex")).resolves.toBe(false);
  });

  it('ignores malformed cache entries instead of throwing', async () => {
    const redis = createRedisMock();
    redis.lrange.mockResolvedValue(['not-json']);
    getKVRedisClient.mockReturnValue(redis);

    await expect(isDuplicateOfRecentWrite('user-1', 'anything')).resolves.toBe(false);
  });
});

describe('recordRecentWrite', () => {
  beforeEach(() => {
    getKVRedisClient.mockReset();
  });

  it('is a no-op when Redis is not configured', async () => {
    getKVRedisClient.mockReturnValue(null);
    await expect(recordRecentWrite('user-1', 'likes hiking')).resolves.toBeUndefined();
  });

  it('pushes, trims, and re-expires the recent-writes list', async () => {
    const redis = createRedisMock();
    getKVRedisClient.mockReturnValue(redis);

    await recordRecentWrite('user-1', 'likes hiking');

    expect(redis.multi).toHaveBeenCalledTimes(1);
    expect(redis.__multiChain.lpush).toHaveBeenCalledWith(
      'graphiti:recent:user-1',
      expect.stringContaining('likes hiking'),
    );
    expect(redis.__multiChain.ltrim).toHaveBeenCalledWith('graphiti:recent:user-1', 0, 4);
    expect(redis.__multiChain.expire).toHaveBeenCalledWith('graphiti:recent:user-1', 600);
    expect(redis.__multiChain.exec).toHaveBeenCalledTimes(1);
  });
});
