import 'server-only';

import { serverEnv } from '@/env/server';

export interface DetectedEntity {
  start: number;
  end: number;
  type: string;
  score: number;
  text: string;
}

function requestDetect(url: string, body: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
}

// Detection only — the presidio-service does NER + regex recognition and
// returns spans; tokenization/HMAC/vaulting happens on the Node side so the
// secret and the vault never have to leave this process.
export async function detectEntities(
  text: string,
  language: string,
  denyTerms: string[],
  enableNer = true,
): Promise<DetectedEntity[]> {
  if (!text.trim()) return [];

  const url = `${serverEnv.ANONYMIZER_API_URL.replace(/\/$/, '')}/detect`;
  const body = JSON.stringify({ text, language, deny_terms: denyTerms, enable_ner: enableNer });

  let response: Response;
  try {
    response = await requestDetect(url, body);
    if (response.status >= 500) throw new Error(`[anonymizer] /detect failed with status ${response.status}`);
  } catch {
    // One retry after a short delay — covers a transient blip (momentary
    // queueing under a burst, a dropped connection) without piling more
    // load onto presidio-api during a real outage. Concurrency into it is
    // already capped by detectLimit in pseudonymize.ts, so this can't turn
    // into its own retry storm.
    await new Promise((resolve) => setTimeout(resolve, 300));
    response = await requestDetect(url, body);
  }

  if (!response.ok) {
    throw new Error(`[anonymizer] /detect failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.entities) ? data.entities : [];
}
