// https://env.t3.gg/docs/nextjs#create-your-schema
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const serverEnv = createEnv({
  server: {
    XAI_API_KEY: z.string().optional().default('placeholder'),
    OPENAI_API_KEY: z.string().optional().default('placeholder'),
    // ANTHROPIC_API_KEY: z.string().optional().default("placeholder"),
    GROQ_API_KEY: z.string().optional().default('placeholder'),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional().default('placeholder'),
    DAYTONA_API_KEY: z.string().optional().default('placeholder'),
    SANDBOX_PROVIDER: z.enum(['daytona', 'docker']).default('daytona'),
    STORAGE_PROVIDER: z.enum(['cloudflare-r2', 'minio']).optional().default('cloudflare-r2'),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_BUCKET_NAME: z.string().optional(),
    S3_PUBLIC_URL: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_FORCE_PATH_STYLE: z.string().optional(),
    DOCKER_SANDBOX_URL: z.string().url().default('http://localhost:8000'),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    TWITTER_CLIENT_ID: z.string().optional(),
    TWITTER_CLIENT_SECRET: z.string().optional(),
    REDIS_URL: z.string().optional().default('placeholder'),
    ELEVENLABS_API_KEY: z.string().optional().default('placeholder'),
    TAVILY_API_KEY: z.string().optional().default('placeholder'),
    EXA_API_KEY: z.string().optional().default('placeholder'),
    VALYU_API_KEY: z.string().optional().default('placeholder'),
    TMDB_API_KEY: z.string().optional().default('placeholder'),
    YT_ENDPOINT: z.string().optional().default('placeholder'),
    FIRECRAWL_API_KEY: z.string().optional().default('placeholder'),
    NOTTE_API_KEY: z.string().optional().default('placeholder'),
    PARALLEL_API_KEY: z.string().optional().default('placeholder'),
    SEARXNG_URL: z.string().url().optional(),
    FASTCRW_URL: z.string().url().optional(),
    QDRANT_URL: z.string().url().optional(),
    OPENWEATHER_API_KEY: z.string().optional().default('placeholder'),
    GOOGLE_MAPS_API_KEY: z.string().optional().default('placeholder'),
    AMADEUS_API_KEY: z.string().optional().default('placeholder'),
    AMADEUS_API_SECRET: z.string().optional().default('placeholder'),
    CRON_SECRET: z.string().optional().default('placeholder'),
    BLOB_READ_WRITE_TOKEN: z.string().optional().default('placeholder'),
    SMITHERY_API_KEY: z.string().optional().default('placeholder'),
    COINGECKO_API_KEY: z.string().optional().default('placeholder'),
    SUPADATA_API_KEY: z.string().optional().default('placeholder'),
    QSTASH_TOKEN: z.string().optional().default('placeholder'),
    RESEND_API_KEY: z.string().optional().default('placeholder'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMTP_SECURE: z.coerce.boolean().optional().default(false),
    SUPERMEMORY_API_KEY: z.string().optional().default('placeholder'),
    SPOTIFY_CLIENT_ID: z.string().optional().default('placeholder'),
    SPOTIFY_CLIENT_SECRET: z.string().optional().default('placeholder'),
    MCP_CREDENTIALS_ENCRYPTION_KEY: z.string().optional().default('placeholder'),
    MCP_OAUTH_CALLBACK_ORIGIN: z.string().optional().default('placeholder'),
    ALLOWED_ORIGINS: z.string().optional().default('http://localhost:3000'),
    GITHUB_MCP_CLIENT_ID: z.string().optional().default('placeholder'),
    GITHUB_MCP_CLIENT_SECRET: z.string().optional().default('placeholder'),
    BOX_MCP_CLIENT_ID: z.string().optional().default('placeholder'),
    BOX_MCP_CLIENT_SECRET: z.string().optional().default('placeholder'),
    DROPBOX_MCP_CLIENT_ID: z.string().optional().default('placeholder'),
    DROPBOX_MCP_CLIENT_SECRET: z.string().optional().default('placeholder'),
    SLACK_MCP_CLIENT_ID: z.string().optional().default('placeholder'),
    SLACK_MCP_CLIENT_SECRET: z.string().optional().default('placeholder'),
    HUBSPOT_MCP_CLIENT_ID: z.string().optional().default('placeholder'),
    HUBSPOT_MCP_CLIENT_SECRET: z.string().optional().default('placeholder'),
    UPSTASH_BOX_API_KEY: z.string().optional().default('placeholder'),
    CUSTOM_AI_PROVIDERS: z.string().optional(),
    GRAPHITI_API_URL: z.string().url().optional().default('http://localhost:8001'),
    GRAPHITI_LLM_MODEL: z.string().optional().default('gpt-4o-mini'),
    GRAPHITI_LLM_API_KEY: z.string().optional(),
    GRAPHITI_LLM_BASE_URL: z.string().url().optional(),
    GRAPHITI_EMBEDDING_MODEL: z.string().optional().default('text-embedding-3-small'),
    GRAPHITI_EMBEDDING_API_KEY: z.string().optional(),
    GRAPHITI_EMBEDDING_BASE_URL: z.string().url().optional(),
    ANONYMIZER_API_URL: z.string().url().optional().default('http://localhost:8004'),
    // Internal reachability check only (Diagnostics panel) — distinct from
    // VOICE_S2S_URL, which is the public browser-facing WS address. Default
    // matches s2s-service's published port for local dev (`next dev`);
    // docker-compose.yml overrides it to the Docker service name for prod.
    S2S_SERVICE_URL: z.string().url().optional().default('http://localhost:8100'),
    // Set to false to close new account creation (email/password and social)
    // once an external gate (e.g. Authelia) is no longer in front of the app.
    // NB: z.coerce.boolean() would treat the string "false" as truthy, so this
    // parses explicitly instead (see the SMTP_SECURE footgun above).
    ALLOW_SIGNUPS: z
      .string()
      .optional()
      .default('true')
      .transform((v) => v.toLowerCase() !== 'false'),
  },
  experimental__runtimeEnv: process.env,
});

const REQUIRED_VARS = new Set(['DATABASE_URL', 'BETTER_AUTH_SECRET']);

for (const [key, value] of Object.entries(serverEnv)) {
  if (!REQUIRED_VARS.has(key) && value === 'placeholder') {
    console.warn(`[env] ${key} is not set (placeholder)`);
  }
}

// NEXT_PUBLIC_APP_URL is inlined into the client bundle at build time and
// BETTER_AUTH_BASE_URL is read by Better Auth on the server. Both are used to
// generate OAuth callback / auth URLs in production, so warn (without failing
// the build) if either is missing.
if (process.env.NODE_ENV === 'production') {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.warn('[env] NEXT_PUBLIC_APP_URL is not set — this will be baked into the build as empty/undefined');
  }
  if (!process.env.BETTER_AUTH_BASE_URL) {
    console.warn('[env] BETTER_AUTH_BASE_URL is not set — Better Auth may not generate correct URLs in production');
  }
}
