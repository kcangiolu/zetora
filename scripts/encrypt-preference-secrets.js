// One-off data migration: encrypts API keys that were stored in cleartext in
// user_preferences.preferences before the AES-256-GCM encryption in
// lib/db/queries.ts (encryptPreferenceSecrets/decryptPreferenceSecrets) was
// introduced. Safe to re-run — already-encrypted values are left untouched.
import { Client } from 'pg';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const { DATABASE_URL, MCP_CREDENTIALS_ENCRYPTION_KEY } = process.env;

if (!DATABASE_URL) {
  console.error('[encrypt-preference-secrets] ERROR: DATABASE_URL is required');
  process.exit(1);
}
if (!MCP_CREDENTIALS_ENCRYPTION_KEY || MCP_CREDENTIALS_ENCRYPTION_KEY === 'placeholder') {
  console.error('[encrypt-preference-secrets] ERROR: MCP_CREDENTIALS_ENCRYPTION_KEY is required');
  process.exit(1);
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const ENCRYPTED_PATTERN = /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

function getKey() {
  return createHash('sha256').update(MCP_CREDENTIALS_ENCRYPTION_KEY, 'utf8').digest();
}

function encrypt(value) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function isPlaintextSecret(value) {
  return typeof value === 'string' && value.length > 0 && !ENCRYPTED_PATTERN.test(value);
}

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  const { rows } = await client.query('SELECT id, preferences FROM user_preferences');
  let migrated = 0;

  for (const row of rows) {
    const prefs = row.preferences || {};
    let changed = false;

    if (Array.isArray(prefs['zetora-custom-providers'])) {
      prefs['zetora-custom-providers'] = prefs['zetora-custom-providers'].map((provider) => {
        if (provider && isPlaintextSecret(provider.apiKey)) {
          changed = true;
          return { ...provider, apiKey: encrypt(provider.apiKey) };
        }
        return provider;
      });
    }

    if (changed) {
      await client.query('UPDATE user_preferences SET preferences = $1, updated_at = now() WHERE id = $2', [
        JSON.stringify(prefs),
        row.id,
      ]);
      migrated++;
    }
  }

  console.log(`[encrypt-preference-secrets] Encrypted secrets for ${migrated} of ${rows.length} row(s).`);
} finally {
  await client.end();
}
