import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { serverEnv } from '@/env/server';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// MCP_CREDENTIALS_ENCRYPTION_KEY defaults to "placeholder" in env/server.ts
// (same pattern as CRON_SECRET) — treat that, and an empty value, as unset so
// a forgotten env var never silently degrades to a well-known encryption key.
function getEncryptionKey() {
  const key = serverEnv.MCP_CREDENTIALS_ENCRYPTION_KEY;
  if (!key || key === 'placeholder') {
    throw new Error(
      'MCP_CREDENTIALS_ENCRYPTION_KEY is not configured. Set it to a strong random value before storing MCP credentials or user API keys.',
    );
  }
  return createHash('sha256').update(key, 'utf8').digest();
}

export function encryptMcpCredentials(value: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptMcpCredentials(value: string) {
  const [ivBase64, authTagBase64, encryptedBase64] = value.split(':');
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) throw new Error('Invalid encrypted credential format');

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const encrypted = Buffer.from(encryptedBase64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
