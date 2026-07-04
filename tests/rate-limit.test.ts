import { describe, it, expect } from 'vitest';
import { getClientIdentifier } from '@/lib/rate-limit';

function reqWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/api', { headers });
}

describe('getClientIdentifier', () => {
  it('prefers the first x-forwarded-for entry', () => {
    expect(getClientIdentifier(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('ip:1.2.3.4');
  });

  it('trims whitespace around the forwarded IP', () => {
    expect(getClientIdentifier(reqWith({ 'x-forwarded-for': '  9.9.9.9  ' }))).toBe('ip:9.9.9.9');
  });

  it('falls back to x-real-ip', () => {
    expect(getClientIdentifier(reqWith({ 'x-real-ip': '10.0.0.1' }))).toBe('ip:10.0.0.1');
  });

  it('falls back to cf-connecting-ip', () => {
    expect(getClientIdentifier(reqWith({ 'cf-connecting-ip': '11.0.0.1' }))).toBe('ip:11.0.0.1');
  });

  it('returns ip:unknown when no IP header is present', () => {
    expect(getClientIdentifier(reqWith({}))).toBe('ip:unknown');
  });
});
