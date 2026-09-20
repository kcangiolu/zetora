function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export const config = {
  port: Number(process.env.HERMES_RELAY_PORT ?? 8200),
  zetoraInternalUrl: requireEnv('ZETORA_INTERNAL_URL', 'http://zetora-app:3333'),
  internalSecret: requireEnv('HERMES_RELAY_INTERNAL_SECRET'),
  // Pinned to the version of docs/relay-connector-contract.md this adapter was written
  // against (currently v1, additive-only within a version per that doc's §9). Bumping
  // this is a deliberate act, not automatic — see README.md.
  contractVersion: 1,
};
