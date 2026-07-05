import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { datetimeTool } from '@/lib/tools/datetime';

const frozen = new Date('2026-07-05T14:30:45Z');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(frozen);
});

afterAll(() => vi.useRealTimers());

// execute()'s declared return type is a union with the streaming AsyncIterable
// variant; the implementation always resolves to the plain object.
async function run() {
  return (await datetimeTool.execute!({}, { toolCallId: 't', messages: [] })) as {
    timestamp: number;
    iso: string;
    timezone: string;
    formatted: Record<string, string>;
  };
}

describe('datetimeTool', () => {
  it('reports the current instant in UTC', async () => {
    const result = await run();
    expect(result.timezone).toBe('UTC');
    expect(result.timestamp).toBe(frozen.getTime());
    expect(result.iso).toBe('2026-07-05T14:30:45.000Z');
  });

  it('formats human-readable UTC variants consistently', async () => {
    const result = await run();
    expect(result.formatted.date).toBe('Sunday, July 5, 2026');
    expect(result.formatted.dateShort).toBe('Jul 5, 2026');
    expect(result.formatted.time).toMatch(/^02:30:45\sPM$/);
    expect(result.formatted.iso_local).toBe('2026-07-05T14:30:45');
  });
});
