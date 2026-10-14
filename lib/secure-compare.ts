import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

// Compares a secret from a request with the expected one in constant time, so
// response timing does not reveal how much of a guess was right. Hashing first
// gives both sides the same length without leaking the secret's length.
export function secretsEqual(provided: string | null | undefined, expected: string): boolean {
  if (provided == null) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
