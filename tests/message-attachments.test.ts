import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DOCUMENT_MIME_TYPES,
  collectAttachments,
  stripFilePartsForModel,
  buildFileInstruction,
  buildImageInstruction,
  fetchInlineableTextFiles,
  appendGeneratedImagePartsToLastUserMessage,
} from '@/lib/search/message-attachments';

function fileMsg(parts: Array<{ mediaType?: string; url?: string; name?: string }>) {
  return {
    parts: parts.map((p) => ({ type: 'file', ...p })),
  };
}

describe('collectAttachments', () => {
  it('splits documents, images and other files into separate categories', () => {
    const { contextFiles, contextImages, otherFileParts } = collectAttachments([
      fileMsg([
        { mediaType: 'application/pdf', url: 'https://x/doc.pdf', name: 'doc.pdf' },
        { mediaType: 'image/png', url: 'https://x/pic.png', name: 'pic.png' },
        { mediaType: 'text/x-python', url: 'https://x/script.py', name: 'script.py' },
      ]),
    ]);
    expect(contextFiles).toEqual([{ url: 'https://x/doc.pdf', contentType: 'application/pdf', name: 'doc.pdf' }]);
    expect(contextImages).toEqual([{ url: 'https://x/pic.png', contentType: 'image/png', name: 'pic.png' }]);
    expect(otherFileParts).toEqual([{ url: 'https://x/script.py', contentType: 'text/x-python', name: 'script.py' }]);
  });

  it('dedupes by URL within a category across messages', () => {
    const { contextFiles } = collectAttachments([
      fileMsg([{ mediaType: 'application/pdf', url: 'https://x/doc.pdf', name: 'doc.pdf' }]),
      fileMsg([{ mediaType: 'application/pdf', url: 'https://x/doc.pdf', name: 'doc.pdf' }]),
      fileMsg([{ mediaType: 'text/csv', url: 'https://x/data.csv', name: 'data.csv' }]),
    ]);
    expect(contextFiles.map((f) => f.url)).toEqual(['https://x/doc.pdf', 'https://x/data.csv']);
  });

  it('categorizes every known document mime type as a context file', () => {
    for (const mime of DOCUMENT_MIME_TYPES) {
      const { contextFiles, otherFileParts } = collectAttachments([
        fileMsg([{ mediaType: mime, url: `https://x/f`, name: 'f' }]),
      ]);
      expect(contextFiles).toHaveLength(1);
      expect(otherFileParts).toHaveLength(0);
    }
  });

  it('skips parts without a URL and non-file parts', () => {
    const result = collectAttachments([
      { parts: [{ type: 'text', text: 'hello' }, { type: 'file', mediaType: 'application/pdf' }] },
      { parts: undefined },
    ]);
    expect(result.contextFiles).toHaveLength(0);
    expect(result.contextImages).toHaveLength(0);
    expect(result.otherFileParts).toHaveLength(0);
  });

  it('picks up successful generate_image/edit_image tool outputs as images', () => {
    const { contextImages, contextGeneratedImages } = collectAttachments([
      {
        parts: [
          { type: 'tool-generate_image', state: 'output-available', output: { success: true, imageUrl: 'https://x/gen.png' } },
          { type: 'tool-edit_image', state: 'output-available', output: { success: true, imageUrl: 'https://x/edit.png' } },
        ],
      },
    ]);
    expect(contextGeneratedImages).toEqual([
      { url: 'https://x/gen.png', contentType: 'image/png' },
      { url: 'https://x/edit.png', contentType: 'image/png' },
    ]);
    expect(contextImages).toEqual(contextGeneratedImages);
  });

  it('ignores failed or in-flight generate_image/edit_image tool parts', () => {
    const { contextImages, contextGeneratedImages } = collectAttachments([
      {
        parts: [
          { type: 'tool-generate_image', state: 'output-available', output: { success: false, error: 'nope' } },
          { type: 'tool-generate_image', state: 'input-available', input: { prompt: 'x' } },
        ],
      },
    ]);
    expect(contextImages).toHaveLength(0);
    expect(contextGeneratedImages).toHaveLength(0);
  });

  it('dedupes generated images against already-uploaded images sharing a URL', () => {
    const { contextImages, contextGeneratedImages } = collectAttachments([
      fileMsg([{ mediaType: 'image/png', url: 'https://x/same.png', name: 'same.png' }]),
      { parts: [{ type: 'tool-generate_image', state: 'output-available', output: { success: true, imageUrl: 'https://x/same.png' } }] },
    ]);
    expect(contextImages).toHaveLength(1);
    expect(contextGeneratedImages).toHaveLength(0);
  });
});

describe('stripFilePartsForModel', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'look at this' },
        { type: 'file', mediaType: 'image/png', url: 'https://x/pic.png' },
        { type: 'file', mediaType: 'application/pdf', url: 'https://x/doc.pdf' },
      ],
    },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
  ] as any;

  it('keeps images only when vision is enabled', () => {
    const stripped = stripFilePartsForModel(messages, true);
    expect((stripped[0] as any).content.map((p: any) => p.type)).toEqual(['text', 'file']);
    expect((stripped[0] as any).content[1].mediaType).toBe('image/png');
  });

  it('removes all file parts when vision is disabled', () => {
    const stripped = stripFilePartsForModel(messages, false);
    expect((stripped[0] as any).content.map((p: any) => p.type)).toEqual(['text']);
  });

  it('always removes document parts and leaves non-user messages alone', () => {
    const stripped = stripFilePartsForModel(messages, true);
    expect((stripped[0] as any).content.some((p: any) => p.mediaType === 'application/pdf')).toBe(false);
    expect(stripped[1]).toBe(messages[1]);
  });
});

describe('appendGeneratedImagePartsToLastUserMessage', () => {
  const images = [{ url: 'https://x/gen.png', contentType: 'image/png' }];

  it('appends image content parts to the last user message', () => {
    const messages = [
      { role: 'user', content: [{ type: 'text', text: 'draw a cat' }] },
      { role: 'assistant', content: [{ type: 'tool-result', toolCallId: '1' }] },
    ] as any;
    appendGeneratedImagePartsToLastUserMessage(messages, images);
    expect(messages[0].content).toEqual([
      { type: 'text', text: 'draw a cat' },
      { type: 'image', image: 'https://x/gen.png', mediaType: 'image/png' },
    ]);
    expect(messages[1].content).toEqual([{ type: 'tool-result', toolCallId: '1' }]);
  });

  it('wraps a string content message into an array before appending', () => {
    const messages = [{ role: 'user', content: 'draw a cat' }] as any;
    appendGeneratedImagePartsToLastUserMessage(messages, images);
    expect(messages[0].content).toEqual([
      { type: 'text', text: 'draw a cat' },
      { type: 'image', image: 'https://x/gen.png', mediaType: 'image/png' },
    ]);
  });

  it('is a no-op when there are no images or no user message', () => {
    const messages = [{ role: 'assistant', content: [{ type: 'text', text: 'hi' }] }] as any;
    appendGeneratedImagePartsToLastUserMessage(messages, images);
    expect(messages[0].content).toEqual([{ type: 'text', text: 'hi' }]);

    const userMessages = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] as any;
    appendGeneratedImagePartsToLastUserMessage(userMessages, []);
    expect(userMessages[0].content).toEqual([{ type: 'text', text: 'hi' }]);
  });
});

describe('instruction builders', () => {
  it('lists file names for file_query_search', () => {
    const instruction = buildFileInstruction([
      { url: 'u1', contentType: 'application/pdf', name: 'a.pdf' },
      { url: 'u2', contentType: 'text/csv' },
    ]);
    expect(instruction).toContain('a.pdf, unnamed file');
    expect(instruction).toContain('file_query_search');
  });

  it('switches image wording on the vision flag', () => {
    const images = [{ url: 'https://x/pic.png', contentType: 'image/png', name: 'pic.png' }];
    expect(buildImageInstruction(images, true)).toContain('also shown to you above');
    expect(buildImageInstruction(images, false)).toContain('Vision is off');
    expect(buildImageInstruction(images, false)).toContain('pic.png: https://x/pic.png');
  });
});

describe('fetchInlineableTextFiles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: (url: string) => Promise<Response>) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => impl(url)),
    );
  }

  const ref = (url: string, name?: string) => ({ url, contentType: 'text/plain', name });

  it('inlines small UTF-8 files', async () => {
    stubFetch(async () => new Response('hello world'));
    const result = await fetchInlineableTextFiles([ref('https://x/a.txt', 'a.txt')]);
    expect(result.inlineTextFiles).toEqual([{ name: 'a.txt', text: 'hello world' }]);
    expect(result.unreadableFiles).toHaveLength(0);
    expect(result.largeTextFiles).toHaveLength(0);
  });

  it('routes files over the threshold to largeTextFiles', async () => {
    stubFetch(async () => new Response('x'.repeat(20)));
    const result = await fetchInlineableTextFiles([ref('https://x/big.txt', 'big.txt')], 10);
    expect(result.inlineTextFiles).toHaveLength(0);
    expect(result.largeTextFiles).toEqual([{ url: 'https://x/big.txt', contentType: 'text/plain', name: 'big.txt' }]);
  });

  it('defaults missing contentType to text/plain for large files', async () => {
    stubFetch(async () => new Response('x'.repeat(20)));
    const result = await fetchInlineableTextFiles([{ url: 'https://x/big.txt', contentType: '', name: 'b' }], 10);
    expect(result.largeTextFiles[0].contentType).toBe('text/plain');
  });

  it('reports non-UTF-8 content as unreadable', async () => {
    stubFetch(async () => new Response(new Uint8Array([0xff, 0xfe, 0x00, 0xff])));
    const result = await fetchInlineableTextFiles([ref('https://x/bin', 'bin.dat')]);
    expect(result.unreadableFiles).toEqual([{ name: 'bin.dat' }]);
    expect(result.inlineTextFiles).toHaveLength(0);
  });

  it('reports non-ok responses and fetch failures as unreadable', async () => {
    stubFetch(async (url) => {
      if (url.endsWith('404')) return new Response('nope', { status: 404 });
      throw new Error('network down');
    });
    const result = await fetchInlineableTextFiles([ref('https://x/404', 'gone.txt'), ref('https://x/boom')]);
    expect(result.unreadableFiles).toEqual(
      expect.arrayContaining([{ name: 'gone.txt' }, { name: 'unnamed file' }]),
    );
    expect(result.unreadableFiles).toHaveLength(2);
  });
});
