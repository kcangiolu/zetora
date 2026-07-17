import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { UserMcpServer } from '@/lib/db/schema';
import { decryptMcpCredentials, encryptMcpCredentials } from '@/lib/mcp/crypto';

export type McpAuthType = 'none' | 'bearer' | 'header' | 'oauth';
export type McpTransportType = 'http' | 'sse';

export interface McpCredentialPayload {
  bearerToken?: string;
  headerName?: string;
  headerValue?: string;
}

export interface McpOAuthCredentialPayload {
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface McpServerInput {
  name: string;
  transportType: McpTransportType;
  url: string;
  authType: McpAuthType;
  bearerToken?: string;
  headerName?: string;
  headerValue?: string;
  oauthIssuerUrl?: string;
  oauthAuthorizationUrl?: string;
  oauthTokenUrl?: string;
  oauthScopes?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  isEnabled?: boolean;
}

// Mirrors the private-IP check in app/api/proxy-image/route.ts: MCP server
// URLs are user-supplied (Pro users register/test them), so without this an
// attacker could point a server at an internal service or the cloud
// metadata endpoint and read the response through the MCP bridge/tools APIs.
function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast + reserved
  );
}

export async function validateMcpServerUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }

  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  const isDev = process.env.NODE_ENV !== 'production';
  const isHttps = parsed.protocol === 'https:';
  const isAllowedLocalHttp = isDev && isLocalhost && parsed.protocol === 'http:';

  if (!isHttps && !isAllowedLocalHttp) {
    throw new Error('Only https URLs are allowed in production (http localhost allowed in development)');
  }

  // Dev-mode localhost is explicitly allowed above; everything else must
  // resolve to a public address, even in dev, so behavior stays consistent.
  if (isAllowedLocalHttp) return;

  const host = parsed.hostname;
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Target resolves to a private address');
    return;
  }
  const addresses = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error('Target resolves to a private address');
  }
}

export function getEncryptedMcpCredentials(input: McpServerInput) {
  if (input.authType === 'none') return null;
  if (input.authType === 'bearer') {
    const token = input.bearerToken?.trim();
    if (!token) throw new Error('Bearer token is required');
    return encryptMcpCredentials(JSON.stringify({ bearerToken: token } satisfies McpCredentialPayload));
  }

  if (input.authType === 'header') {
    const headerName = input.headerName?.trim();
    const headerValue = input.headerValue?.trim();
    if (!headerName || !headerValue) throw new Error('Custom header name and value are required');

    return encryptMcpCredentials(JSON.stringify({ headerName, headerValue } satisfies McpCredentialPayload));
  }

  return null;
}

export function getMcpCredentialPayload(server: Pick<UserMcpServer, 'authType' | 'encryptedCredentials'>) {
  if (server.authType === 'none') return {};
  if (!server.encryptedCredentials) throw new Error('Missing encrypted credentials');

  const decrypted = decryptMcpCredentials(server.encryptedCredentials);
  return JSON.parse(decrypted) as McpCredentialPayload;
}

export function getMcpAuthHeaders(server: Pick<UserMcpServer, 'authType' | 'encryptedCredentials'>) {
  if (server.authType === 'none') return {};
  if (server.authType === 'oauth') return {};

  const payload = getMcpCredentialPayload(server);
  if (server.authType === 'bearer') {
    if (!payload.bearerToken) throw new Error('Invalid bearer credential payload');
    return { Authorization: `Bearer ${payload.bearerToken}` };
  }

  if (!payload.headerName || !payload.headerValue) throw new Error('Invalid header credential payload');
  return { [payload.headerName]: payload.headerValue };
}

export function getEncryptedOAuthValue(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return encryptMcpCredentials(JSON.stringify({ value: normalized }));
}

export function decryptOAuthValue(encrypted: string | null | undefined) {
  if (!encrypted) return null;
  try {
    const raw = decryptMcpCredentials(encrypted);
    const parsed = JSON.parse(raw) as { value?: string };
    return parsed.value?.trim() || null;
  } catch {
    return null;
  }
}

export function normalizeMcpScopes(scopes: string | undefined) {
  if (!scopes) return null;
  const cleaned = scopes
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(' ');
  return cleaned || null;
}

export async function validateMcpOAuthConfig(
  input: Pick<
    McpServerInput,
    'authType' | 'oauthIssuerUrl' | 'oauthAuthorizationUrl' | 'oauthTokenUrl' | 'oauthClientId'
  >,
) {
  if (input.authType !== 'oauth') return;

  const issuerUrl = input.oauthIssuerUrl?.trim();
  const authUrl = input.oauthAuthorizationUrl?.trim();
  const tokenUrl = input.oauthTokenUrl?.trim();
  const clientId = input.oauthClientId?.trim();

  if (!issuerUrl && (authUrl || tokenUrl) && (!authUrl || !tokenUrl)) {
    throw new Error('Provide both authorization and token URLs when using manual OAuth endpoints');
  }

  if (issuerUrl) await validateMcpServerUrl(issuerUrl);
  if (authUrl) await validateMcpServerUrl(authUrl);
  if (tokenUrl) await validateMcpServerUrl(tokenUrl);
  if (clientId && /^https?:\/\//i.test(clientId)) await validateMcpServerUrl(clientId);
}
