import { describe, it, expect } from 'vitest';
import { parseLinkMetadata } from '@/lib/link-metadata';

const finalUrl = new URL('https://www.example.com/articles/42');

describe('parseLinkMetadata', () => {
  it('prefers Open Graph tags and resolves relative URLs against the final URL', () => {
    const html = `<html><head>
      <title>Plain title</title>
      <meta property="og:title" content="OG &amp; title">
      <meta name="description" content="Plain description">
      <meta property="og:description" content='OG description'>
      <meta property="og:image" content="/img/cover.png">
      <meta property="og:site_name" content="Example">
      <link rel="canonical" href="https://www.example.com/a/42">
      <link rel="shortcut icon" href="/static/favicon.png">
    </head><body></body></html>`;

    expect(parseLinkMetadata(html, 'https://example.com/a', finalUrl)).toEqual({
      url: 'https://example.com/a',
      finalUrl: 'https://www.example.com/articles/42',
      title: 'OG & title',
      description: 'OG description',
      canonical: 'https://www.example.com/a/42',
      ogUrl: undefined,
      siteName: 'Example',
      image: 'https://www.example.com/img/cover.png',
      favicon: 'https://www.example.com/static/favicon.png',
    });
  });

  it('falls back to <title>, the description meta and /favicon.ico', () => {
    const html = '<head><title>\n  Hello&#x20;world  </title><meta content="Desc" name="description"></head>';
    const metadata = parseLinkMetadata(html, 'https://www.example.com/', finalUrl);
    expect(metadata.title).toBe('Hello world');
    expect(metadata.description).toBe('Desc');
    expect(metadata.favicon).toBe('https://www.example.com/favicon.ico');
  });

  it('ignores non-http(s) links', () => {
    const html = '<head><meta property="og:image" content="javascript:alert(1)"></head>';
    expect(parseLinkMetadata(html, 'https://www.example.com/', finalUrl).image).toBeUndefined();
  });
});
