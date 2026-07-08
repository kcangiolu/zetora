import 'server-only';

import { serverEnv } from '@/env/server';

export interface DetectedEntity {
  start: number;
  end: number;
  type: string;
  score: number;
  text: string;
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
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language, deny_terms: denyTerms, enable_ner: enableNer }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`[anonymizer] /detect failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.entities) ? data.entities : [];
}
