import { describe, it, expect } from 'vitest';
import type { BaseRetriever } from '@vectorstores/core';

import { getFileDisplayName, isSearchableFile, searchFiles, type FileRetrievers } from '@/lib/tools/file-retrieval';

function fakeRetriever(chunks: Array<[string, number]> | Error): BaseRetriever {
  return {
    retrieve: async () => {
      if (chunks instanceof Error) throw chunks;
      return chunks.map(([text, score]) => ({ node: { getContent: () => text }, score }));
    },
  } as unknown as BaseRetriever;
}

describe('isSearchableFile', () => {
  it('accepts documents and text files, rejects binaries', () => {
    expect(isSearchableFile({ contentType: 'application/pdf' })).toBe(true);
    expect(isSearchableFile({ contentType: 'text/markdown' })).toBe(true);
    expect(isSearchableFile({ contentType: 'image/png' })).toBe(false);
  });
});

describe('getFileDisplayName', () => {
  it('falls back to the last URL segment', () => {
    expect(getFileDisplayName({ url: 'https://s.example/u/report.pdf', contentType: 'application/pdf' })).toBe(
      'report.pdf',
    );
    expect(getFileDisplayName({ url: 'x', contentType: 'text/plain', name: 'notes.txt' })).toBe('notes.txt');
  });
});

describe('searchFiles', () => {
  const a = { url: 'https://s.example/a.txt', contentType: 'text/plain', name: 'a.txt' };
  const b = { url: 'https://s.example/b.txt', contentType: 'text/plain' };
  const unindexed = { url: 'https://s.example/c.txt', contentType: 'text/plain' };

  it('merges every indexed file by score and keeps the file URL', async () => {
    const retrievers: FileRetrievers = new Map([
      [
        a.url,
        fakeRetriever([
          ['a1', 0.2],
          ['a2', 0.9],
        ]),
      ],
      [b.url, fakeRetriever([['b1', 0.5]])],
    ]);

    const results = await searchFiles({
      query: 'q',
      files: [a, b, unindexed],
      retrievers,
      maxResults: 2,
      rerank: false,
    });

    expect(results).toEqual([
      { fileName: 'a.txt', fileUrl: a.url, content: 'a2', score: 0.9 },
      { fileName: 'b.txt', fileUrl: b.url, content: 'b1', score: 0.5 },
    ]);
  });

  it('leaves out a file whose search fails', async () => {
    const retrievers: FileRetrievers = new Map([
      [a.url, fakeRetriever(new Error('boom'))],
      [b.url, fakeRetriever([['b1', 0.5]])],
    ]);

    const results = await searchFiles({ query: 'q', files: [a, b], retrievers, maxResults: 5, rerank: false });

    expect(results.map((r) => r.content)).toEqual(['b1']);
  });
});
