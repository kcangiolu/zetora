import 'server-only';

import { isConfigured } from '@/ai/catalog/env';

// Result reranking runs on Cohere. Tools rerank only when the instance has a
// Cohere key and otherwise keep their own ordering, so no request goes to a
// service the instance did not set up.
export function isRerankAvailable(): boolean {
  return isConfigured(process.env.COHERE_API_KEY);
}
