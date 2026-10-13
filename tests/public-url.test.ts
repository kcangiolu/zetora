import { describe, it, expect } from 'vitest';
import { assertPublicHttpUrl, isPrivateIp, PublicUrlError } from '@/lib/net/public-url';

describe('isPrivateIp', () => {
  it('flags loopback, private, link-local and mapped addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });

  it('lets public addresses through', () => {
    expect(isPrivateIp('82.65.136.180')).toBe(false);
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  it('rejects non-http schemes and private IP literals', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toBeInstanceOf(PublicUrlError);
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(PublicUrlError);
    await expect(assertPublicHttpUrl('not a url')).rejects.toBeInstanceOf(PublicUrlError);
  });

  it('accepts a public IP literal', async () => {
    await expect(assertPublicHttpUrl('https://1.1.1.1/')).resolves.toBeInstanceOf(URL);
  });
});
