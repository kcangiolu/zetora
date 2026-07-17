import { withProAuth } from '@/lib/api/route-handlers';
import { createUserMcpServer, getUserMcpServersByUserId } from '@/lib/db/queries';
import {
  getEncryptedMcpCredentials,
  getEncryptedOAuthValue,
  normalizeMcpScopes,
  validateMcpOAuthConfig,
  validateMcpServerUrl,
} from '@/lib/mcp/server-config';
import { z } from 'zod';

const optionalUrlField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().url().optional(),
);

const createMcpServerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  transportType: z.enum(['http', 'sse']),
  url: z.string().trim().url(),
  authType: z.enum(['none', 'bearer', 'header', 'oauth']),
  bearerToken: z.string().optional(),
  headerName: z.string().optional(),
  headerValue: z.string().optional(),
  oauthIssuerUrl: optionalUrlField,
  oauthAuthorizationUrl: optionalUrlField,
  oauthTokenUrl: optionalUrlField,
  oauthScopes: z.string().optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),
  isEnabled: z.boolean().optional(),
});

function serializeMcpServer(server: {
  id: string;
  name: string;
  transportType: 'http' | 'sse';
  url: string;
  authType: 'none' | 'bearer' | 'header' | 'oauth';
  isEnabled: boolean;
  lastTestedAt: Date | null;
  lastError: string | null;
  oauthConnectedAt: Date | null;
  oauthError: string | null;
  createdAt: Date;
  updatedAt: Date;
  encryptedCredentials: string | null;
  oauthClientId: string | null;
  oauthIssuerUrl: string | null;
  oauthAuthorizationUrl: string | null;
  oauthTokenUrl: string | null;
  oauthScopes: string | null;
  oauthAccessTokenEncrypted: string | null;
  oauthRefreshTokenEncrypted: string | null;
}) {
  return {
    id: server.id,
    name: server.name,
    transportType: server.transportType,
    url: server.url,
    authType: server.authType,
    isEnabled: server.isEnabled,
    hasCredentials: Boolean(server.encryptedCredentials),
    isOAuthConnected: Boolean(
      server.oauthAccessTokenEncrypted || server.oauthRefreshTokenEncrypted || server.oauthConnectedAt,
    ),
    oauthConfigured: server.authType === 'oauth',
    oauthIssuerUrl: server.oauthIssuerUrl,
    oauthAuthorizationUrl: server.oauthAuthorizationUrl,
    oauthTokenUrl: server.oauthTokenUrl,
    oauthScopes: server.oauthScopes,
    oauthClientId: server.oauthClientId,
    oauthError: server.oauthError,
    oauthConnectedAt: server.oauthConnectedAt,
    lastTestedAt: server.lastTestedAt,
    lastError: server.lastError,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

export const GET = withProAuth(async (_request, { user }) => {
  const servers = await getUserMcpServersByUserId({ userId: user.id });
  return Response.json({ servers: servers.map(serializeMcpServer) });
});

export const POST = withProAuth(
  async (request, { user }) => {
    const input = createMcpServerSchema.parse(await request.json());
    await validateMcpServerUrl(input.url);
    await validateMcpOAuthConfig(input);

    const created = await createUserMcpServer({
      userId: user.id,
      name: input.name,
      transportType: input.transportType,
      url: input.url,
      authType: input.authType,
      encryptedCredentials: getEncryptedMcpCredentials(input),
      oauthIssuerUrl: input.oauthIssuerUrl?.trim() || null,
      oauthAuthorizationUrl: input.oauthAuthorizationUrl?.trim() || null,
      oauthTokenUrl: input.oauthTokenUrl?.trim() || null,
      oauthScopes: normalizeMcpScopes(input.oauthScopes),
      oauthClientId: input.oauthClientId?.trim() || null,
      oauthClientSecretEncrypted: getEncryptedOAuthValue(input.oauthClientSecret),
      oauthAccessTokenEncrypted: null,
      oauthRefreshTokenEncrypted: null,
      oauthAccessTokenExpiresAt: null,
      oauthConnectedAt: null,
      oauthError: null,
      isEnabled: input.isEnabled ?? true,
    });

    return Response.json({ server: serializeMcpServer(created) });
  },
  { genericError: 'expose' },
);
