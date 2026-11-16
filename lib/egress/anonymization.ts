import 'server-only';

import { isAnonymizationAvailable } from '@/lib/instance/capabilities';
import type { AnonymizeContext } from '@/lib/anonymizer/pseudonymize';
import type { UserPreferenceValues } from '@/lib/db/schema';
import { EgressBlockedError } from './errors';
import { receivesCleartext, type TrustClass } from './trust';

// The user's anonymization settings, or null when anonymization is off for
// them. Whether a given provider gets pseudonyms is the caller's question:
// see getAnonymizeContext (ai/providers.ts) for language models.
export function getUserAnonymizeContext(
  preferences: UserPreferenceValues | null | undefined,
  userId: string | undefined,
): AnonymizeContext | null {
  if (!userId) return null;
  // Without a PII detector the instance doesn't offer anonymization at all
  // (Settings hides it), so a preference left over from before is moot.
  if (!isAnonymizationAvailable()) return null;
  if (preferences?.['zetora-anonymization-enabled'] !== true) return null;

  return {
    userId,
    language: preferences['zetora-anonymization-language'] ?? 'en',
    nerEnabled: preferences['zetora-anonymization-ner-enabled'] !== false,
    denyTerms: preferences['zetora-anonymization-custom-terms'] ?? [],
    failOpen: preferences['zetora-anonymization-fail-open'] === true,
  };
}

interface CleartextEgress {
  preferences: UserPreferenceValues | null | undefined;
  userId: string | undefined;
  trust: TrustClass;
  // What would be sent, as the end of "Anonymization is on, so ... cannot".
  what: string;
  // The setting that lets the request through.
  fix: string;
}

// Audio, images and raw file text cannot be pseudonymized: with anonymization
// on they may only reach a local provider.
export function assertCleartextAllowed({ preferences, userId, trust, what, fix }: CleartextEgress): void {
  if (receivesCleartext(trust)) return;
  if (!getUserAnonymizeContext(preferences, userId)) return;
  throw new EgressBlockedError(`Anonymization is on, so ${what} cannot go to a provider that is not local. ${fix}`);
}
