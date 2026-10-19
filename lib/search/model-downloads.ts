import { all } from 'better-all';

import { getBetterAllOptions } from '@/lib/better-all';
import { createLogger } from '@/lib/logger';
import { fetchAttachment } from '@/lib/net/attachment-fetch';

const log = createLogger('search');

// streamText's experimental_download: the images and files of the conversation are
// always downloaded here and sent as bytes, even to models that accept URLs. The storage
// host is geo-restricted, so a provider fetching the URL from its own servers would get
// a 404 and never see the file.
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
