import { all } from 'better-all';

import { getBetterAllOptions } from '@/lib/better-all';
import { createLogger } from '@/lib/logger';
import { fetchAttachment } from '@/lib/net/attachment-fetch';

const log = createLogger('search');

// experimental_download for every model call that carries the conversation's images and
// files: they are downloaded here and sent as bytes, even to models that accept URLs. A
// provider fetching the URL from its own servers can be refused by a storage host that
// filters by country, and the SDK's own download refuses the private address a storage
// on the same machine has.
export async function downloadForModel(requested: Array<{ url: URL }>) {
  type DownloadResult = { data: Uint8Array; mediaType: string | undefined } | null;
  const tasks = Object.fromEntries(
    requested.map(({ url }, index) => [
      `dl:${index}`,
      async (): Promise<DownloadResult> => {
        log.info(`Downloading for the model: ${url.toString()}`);
        const { bytes: data, contentType: mediaType } = await fetchAttachment(url.toString());
        log.info(`Download succeeded: ${url.toString()} (${data.byteLength} bytes, ${mediaType})`);
        return { data, mediaType };
      },
    ]),
  );
  const results = await all(tasks, getBetterAllOptions());
  return requested.map((_, index) => results[`dl:${index}`]);
}
