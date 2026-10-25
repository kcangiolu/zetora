import { describe, it, expect } from 'vitest';
import { hermesMessageTypeFor, resolveHermesAttachments } from '@/lib/hermes/attachments';

const STORAGE = 'https://storage.test';
const USER = 'user-1';

const resolve = (attachments: Array<{ url: string; name?: string; mediaType?: string }>) =>
  resolveHermesAttachments({ attachments, userId: USER, storagePublicUrl: STORAGE });

describe('resolveHermesAttachments', () => {
  it('accepts the user own uploads and carries their mime and name', () => {
    const { media, rejected } = resolve([
      { url: `${STORAGE}/zetora/users/${USER}/abc.png`, name: 'shot.png', mediaType: 'image/png' },
    ]);
    expect(rejected).toEqual([]);
    expect(media).toEqual([{ url: `${STORAGE}/zetora/users/${USER}/abc.png`, mime: 'image/png', name: 'shot.png' }]);
  });

  it('rejects a lookalike origin rather than matching it as a string prefix', () => {
    const { media, rejected } = resolve([
      { url: `https://storage.test.evil.com/zetora/users/${USER}/abc.png`, name: 'shot.png' },
    ]);
    expect(media).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it("rejects another user's object in the same bucket", () => {
    const { media, rejected } = resolve([{ url: `${STORAGE}/zetora/users/user-2/abc.png`, name: 'theirs.png' }]);
    expect(media).toEqual([]);
    expect(rejected).toEqual([{ name: 'theirs.png', reason: 'not an uploaded file of yours' }]);
  });

  it('rejects a traversal that climbs out of the owner prefix', () => {
    const { media } = resolve([{ url: `${STORAGE}/zetora/users/${USER}/../user-2/abc.png` }]);
    expect(media).toEqual([]);
  });

  it('rejects a URL on another host entirely', () => {
    const { media } = resolve([{ url: 'https://evil.example/payload.bin', name: 'payload.bin' }]);
    expect(media).toEqual([]);
  });

  it('keeps the bucket path of a path-style public URL', () => {
    const minio = 'http://localhost:9000/zetora-uploads';
    const own = `${minio}/zetora/users/${USER}/abc.pdf`;
    expect(
      resolveHermesAttachments({ attachments: [{ url: own }], userId: USER, storagePublicUrl: minio }).media,
    ).toEqual([{ url: own, mime: '', name: null }]);
    // Same object name, but outside the bucket the public URL points at.
    expect(
      resolveHermesAttachments({
        attachments: [{ url: `http://localhost:9000/other-bucket/zetora/users/${USER}/abc.pdf` }],
        userId: USER,
        storagePublicUrl: minio,
      }).media,
    ).toEqual([]);
  });
});

describe('hermesMessageTypeFor', () => {
  it('reports text when nothing is attached', () => {
    expect(hermesMessageTypeFor([])).toBe('text');
  });

  it('reports photo only when every attachment is an image', () => {
    expect(hermesMessageTypeFor(['image/png', 'image/jpeg'])).toBe('photo');
  });

  it('reports document for a mixed or non-image set', () => {
    expect(hermesMessageTypeFor(['image/png', 'application/pdf'])).toBe('document');
    expect(hermesMessageTypeFor(['application/pdf'])).toBe('document');
    // An unknown mime must not be assumed to be an image — misclassifying one is what
    // gets a non-image base64'd into a vision content part.
    expect(hermesMessageTypeFor([''])).toBe('document');
  });
});
