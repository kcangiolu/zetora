import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DOCUMENT_MIME_TYPES,
  collectAttachments,
  stripFilePartsForModel,
  buildFileInstruction,
  buildImageInstruction,
  fetchInlineableTextFiles,
  appendGeneratedImagePartsToLastUserMessage,
  labelUploadedImagesInPlace,
  reconcileImageReferencesAfterPruning,
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
    expect(contextImages).toEqual([
      { url: 'https://x/pic.png', contentType: 'image/png', name: 'pic.png', turnIndex: 0, sourceMessageId: '' },
    ]);
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
      { url: 'https://x/gen.png', contentType: 'image/png', turnIndex: 0, sourceMessageId: '' },
      { url: 'https://x/edit.png', contentType: 'image/png', turnIndex: 0, sourceMessageId: '' },
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

  it('stamps each generated image with the turn it was produced in and carries prompt/seed/toolCallId', () => {
    const { contextGeneratedImages } = collectAttachments([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'draw a cat' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-generate_image',
            toolCallId: 'call-1',
            state: 'output-available',
            output: { success: true, imageUrl: 'https://x/cat.png', prompt: 'a cat', seed: 42 },
          },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'draw a dog' }] },
      {
        id: 'a2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-generate_image',
            toolCallId: 'call-2',
            state: 'output-available',
            output: { success: true, imageUrl: 'https://x/dog.png', prompt: 'a dog', seed: 7 },
          },
        ],
      },
    ]);
    expect(contextGeneratedImages).toEqual([
      { url: 'https://x/cat.png', contentType: 'image/png', turnIndex: 1, sourceMessageId: 'a1', toolCallId: 'call-1', prompt: 'a cat', seed: 42 },
      { url: 'https://x/dog.png', contentType: 'image/png', turnIndex: 2, sourceMessageId: 'a2', toolCallId: 'call-2', prompt: 'a dog', seed: 7 },
    ]);
  });

  it('excludes generated images whose URL is in hiddenImageUrls', () => {
    const { contextImages, contextGeneratedImages } = collectAttachments(
      [
        { role: 'user', parts: [{ type: 'text', text: 'draw a cat' }] },
        {
          role: 'assistant',
          parts: [{ type: 'tool-generate_image', state: 'output-available', output: { success: true, imageUrl: 'https://x/cat.png' } }],
        },
      ],
      new Set(['https://x/cat.png']),
    );
    expect(contextImages).toHaveLength(0);
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
  const images = [{ url: 'https://x/gen.png', contentType: 'image/png', turnIndex: 1, sourceMessageId: 'a1' }];
  const singleImageLabel = '\n\n[Image 1 of 1 — generated 1 turn ago. When discussing this image, refer to it as "Image 1".]';

  it('interleaves a text label immediately before each image content part on the last user message', () => {
    const messages = [
      { role: 'user', content: [{ type: 'text', text: 'draw a cat' }] },
      { role: 'assistant', content: [{ type: 'tool-result', toolCallId: '1' }] },
    ] as any;
    appendGeneratedImagePartsToLastUserMessage(messages, images, 2);
    expect(messages[0].content).toEqual([
      { type: 'text', text: 'draw a cat' },
      { type: 'text', text: singleImageLabel },
      { type: 'image', image: 'https://x/gen.png', mediaType: 'image/png' },
    ]);
    expect(messages[1].content).toEqual([{ type: 'tool-result', toolCallId: '1' }]);
  });

  it('labels the most recent image differently and includes the prompt when present', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'draw a cat' }] }] as any;
    appendGeneratedImagePartsToLastUserMessage(
      messages,
      [{ url: 'https://x/gen.png', contentType: 'image/png', turnIndex: 3, sourceMessageId: 'a1', prompt: 'a golden retriever' }],
      3,
    );
    expect(messages[0].content[1]).toEqual({
      type: 'text',
      text: '\n\n[Image 1 of 1 — most recent, generated just now, prompt: "a golden retriever". When discussing this image, refer to it as "Image 1".]',
    });
  });

  it('wraps a string content message into an array before appending', () => {
    const messages = [{ role: 'user', content: 'draw a cat' }] as any;
    appendGeneratedImagePartsToLastUserMessage(messages, images, 2);
    expect(messages[0].content).toEqual([
      { type: 'text', text: 'draw a cat' },
      { type: 'text', text: singleImageLabel },
      { type: 'image', image: 'https://x/gen.png', mediaType: 'image/png' },
    ]);
  });

  it('is a no-op when there are no images or no user message', () => {
    const messages = [{ role: 'assistant', content: [{ type: 'text', text: 'hi' }] }] as any;
    appendGeneratedImagePartsToLastUserMessage(messages, images, 2);
    expect(messages[0].content).toEqual([{ type: 'text', text: 'hi' }]);

    const userMessages = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] as any;
    appendGeneratedImagePartsToLastUserMessage(userMessages, [], 2);
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
    const images = [{ url: 'https://x/pic.png', contentType: 'image/png', name: 'pic.png', turnIndex: 1, sourceMessageId: 'u1' }];
    expect(buildImageInstruction(images, [], true)).toContain('also shown to you above');
    expect(buildImageInstruction(images, [], false)).toContain('Vision is off');
    expect(buildImageInstruction(images, [], false)).toContain('Uploaded image 1 (pic.png): https://x/pic.png');
  });

  it('numbers uploaded and generated images independently, each with their own prefix', () => {
    const uploaded = [
      { url: 'https://x/a.png', contentType: 'image/png', name: 'a.png', turnIndex: 1, sourceMessageId: 'u1' },
      { url: 'https://x/b.png', contentType: 'image/png', name: 'b.png', turnIndex: 2, sourceMessageId: 'u2' },
    ];
    const generated = [
      { url: 'https://x/gen.png', contentType: 'image/png', turnIndex: 3, sourceMessageId: 'a1', prompt: 'a cat' },
    ];
    const instruction = buildImageInstruction(uploaded, generated, true);
    expect(instruction).toContain('Uploaded image 1 (a.png): https://x/a.png');
    expect(instruction).toContain('Uploaded image 2 (b.png): https://x/b.png');
    expect(instruction).toContain('Generated image 1 (prompt: "a cat"): https://x/gen.png');
  });
});

describe('labelUploadedImagesInPlace', () => {
  it('inserts a numbered label immediately before each matching file part', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'file', mediaType: 'image/png', url: 'https://x/a.png' },
        ],
      },
    ] as any;
    const uploaded = [{ url: 'https://x/a.png', contentType: 'image/png', turnIndex: 1, sourceMessageId: 'u1' }];
    labelUploadedImagesInPlace(messages, uploaded, 2);
    expect(messages[0].content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'text', text: '\n\n[Uploaded image 1 of 1 — attached 1 turn ago. When discussing this image, refer to it as "Uploaded image 1".]' },
      { type: 'file', mediaType: 'image/png', url: 'https://x/a.png' },
    ]);
  });

  it('is a no-op when there are no uploaded images', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] as any;
    labelUploadedImagesInPlace(messages, [], 2);
    expect(messages[0].content).toEqual([{ type: 'text', text: 'hi' }]);
  });
});

describe('reconcileImageReferencesAfterPruning', () => {
  it('drops generated-image pairs from a pruned turn and rewrites the trailing instruction', () => {
    const uploaded = [{ url: 'https://x/a.png', contentType: 'image/png', name: 'a.png', turnIndex: 1, sourceMessageId: 'u1' }];
    const generated = [
      { url: 'https://x/gen1.png', contentType: 'image/png', turnIndex: 1, sourceMessageId: 'a1', prompt: 'old' },
      { url: 'https://x/gen2.png', contentType: 'image/png', turnIndex: 2, sourceMessageId: 'a2', prompt: 'new' },
    ];
    const previousImageInstruction = buildImageInstruction(uploaded, generated, true);
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: `question${previousImageInstruction}` },
          { type: 'text', text: '\n\n[Image 1 of 2 — generated 1 turn ago, prompt: "old". When discussing this image, refer to it as "Image 1".]' },
          { type: 'image', image: 'https://x/gen1.png', mediaType: 'image/png' },
          { type: 'text', text: '\n\n[Image 2 of 2 — most recent, generated just now, prompt: "new". When discussing this image, refer to it as "Image 2".]' },
          { type: 'image', image: 'https://x/gen2.png', mediaType: 'image/png' },
        ],
      },
    ] as any;

    // Turn 1 (the uploaded image and the first generated image) was pruned.
    reconcileImageReferencesAfterPruning({
      messages,
      turnsRemoved: 1,
      contextUploadedImages: uploaded,
      contextGeneratedImages: generated,
      visionEnabled: true,
      previousImageInstruction,
    });

    const content = messages[0].content;
    expect(content.some((p: any) => p.type === 'image' && p.image === 'https://x/gen1.png')).toBe(false);
    expect(content.some((p: any) => p.type === 'image' && p.image === 'https://x/gen2.png')).toBe(true);
    const rewrittenText = content[0].text as string;
    expect(rewrittenText).not.toContain('a.png');
    expect(rewrittenText).toContain('Generated image 1 (prompt: "new"): https://x/gen2.png');
  });

  it('clears the instruction entirely when every image was in pruned turns', () => {
    const generated = [{ url: 'https://x/gen.png', contentType: 'image/png', turnIndex: 1, sourceMessageId: 'a1' }];
    const previousImageInstruction = buildImageInstruction([], generated, true);
    const messages = [
      {
        role: 'user',
        content: [{ type: 'text', text: `question${previousImageInstruction}` }],
      },
    ] as any;

    reconcileImageReferencesAfterPruning({
      messages,
      turnsRemoved: 1,
      contextUploadedImages: [],
      contextGeneratedImages: generated,
      visionEnabled: true,
      previousImageInstruction,
    });

    expect(messages[0].content[0].text).toBe('question');
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
