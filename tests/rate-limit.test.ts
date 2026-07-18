import { describe, it, expect, afterEach } from 'vitest';
import { getClientIdentifier } from '@/lib/rate-limit';

function reqWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/api', { headers });
}

const ORIGINAL_TRUSTED_PROXY = process.env.TRUSTED_PROXY;

afterEach(() => {
  if (ORIGINAL_TRUSTED_PROXY === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = ORIGINAL_TRUSTED_PROXY;
});

describe('getClientIdentifier', () => {
  describe('TRUSTED_PROXY unset (default)', () => {
    it('ignores x-forwarded-for entirely — it is client-controlled without a trusted proxy', () => {
      delete process.env.TRUSTED_PROXY;
      expect(getClientIdentifier(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('ip:unknown');
    });

    it('ignores x-real-ip and cf-connecting-ip too', () => {
      delete process.env.TRUSTED_PROXY;
      expect(getClientIdentifier(reqWith({ 'x-real-ip': '10.0.0.1' }))).toBe('ip:unknown');
      expect(getClientIdentifier(reqWith({ 'cf-connecting-ip': '11.0.0.1' }))).toBe('ip:unknown');
    });
  });

  describe('TRUSTED_PROXY=true', () => {
    it('prefers the LAST x-forwarded-for entry — the hop our own proxy added', () => {
      process.env.TRUSTED_PROXY = 'true';
      expect(getClientIdentifier(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('ip:5.6.7.8');
    });

    it('trims whitespace around the forwarded IP', () => {
      process.env.TRUSTED_PROXY = 'true';
      expect(getClientIdentifier(reqWith({ 'x-forwarded-for': '  9.9.9.9  ' }))).toBe('ip:9.9.9.9');
    });

    it('prefers x-real-ip over x-forwarded-for', () => {
      process.env.TRUSTED_PROXY = 'true';
      expect(getClientIdentifier(reqWith({ 'x-real-ip': '10.0.0.1', 'x-forwarded-for': '1.2.3.4' }))).toBe(
        'ip:10.0.0.1',
      );
    });

    it('prefers cf-connecting-ip over everything else', () => {
      process.env.TRUSTED_PROXY = 'true';
      expect(
        getClientIdentifier(
          reqWith({ 'cf-connecting-ip': '11.0.0.1', 'x-real-ip': '10.0.0.1', 'x-forwarded-for': '1.2.3.4' }),
        ),
      ).toBe('ip:11.0.0.1');
    });

    it('returns ip:unknown when no IP header is present', () => {
      process.env.TRUSTED_PROXY = 'true';
      expect(getClientIdentifier(reqWith({}))).toBe('ip:unknown');
    });
  });
});
