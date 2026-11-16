// How far the instance trusts a provider with the data it sends there. Every
// provider that receives user content carries one, and the anonymization rules
// read it.
//
// - local: runs inside the instance's own perimeter (llama.cpp, Ollama, the
//   bundled services). Data sent there never leaves the operator's machines.
// - contracted: an outside service the operator has a contract with (region,
//   no retention).
// - external: any other outside service.
export const TRUST_CLASSES = ['local', 'contracted', 'external'] as const;

export type TrustClass = (typeof TRUST_CLASSES)[number];

export function isTrustClass(value: unknown): value is TrustClass {
  return typeof value === 'string' && (TRUST_CLASSES as readonly string[]).includes(value);
}

export const TRUST_CLASS_LABEL: Record<TrustClass, string> = {
  local: 'Local',
  contracted: 'Contracted',
  external: 'External',
};

// With anonymization on, only a local provider receives cleartext. A
// contract does not change what a provider can read, so contracted providers
// are pseudonymized like external ones.
export function receivesCleartext(trust: TrustClass): boolean {
  return trust === 'local';
}
