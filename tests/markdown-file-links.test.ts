import { describe, it, expect } from 'vitest';

import { isAppFileUrl } from '@/components/markdown/shared';

describe('isAppFileUrl', () => {
  it('accepts files stored by the app, on any storage host', () => {
    expect(isAppFileUrl('https://storage.example.com/zetora/users/user-1/generated/abc-report.pdf')).toBe(true);
    expect(isAppFileUrl('https://storage.example.com/bucket/zetora/downloads/abc-data.xlsx')).toBe(true);
    expect(isAppFileUrl('/api/files/abc-report.pdf')).toBe(true);
  });

  it('rejects documents on other sites, which are cited sources', () => {
    expect(isAppFileUrl('https://www.nasa.gov/wp-content/uploads/JWST-Optics.pdf')).toBe(false);
    expect(isAppFileUrl('https://example.com/paper.docx')).toBe(false);
    expect(isAppFileUrl('not a url')).toBe(false);
  });
});
