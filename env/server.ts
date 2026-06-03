// https://env.t3.gg/docs/nextjs#create-your-schema
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';


export const serverEnv = createEnv({
  server: {
    XAI_API_KEY: z.string().optional().default("placeholder"),
    OPENAI_API_KEY: z.string().optional().default("placeholder"),
    // ANTHROPIC_API_KEY: z.string().optional().default("placeholder"),
    GROQ_API_KEY: z.string().optional().default("placeholder"),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional().default("placeholder"),
    DAYTONA_API_KEY: z.string().optional().default("placeholder"),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    TWITTER_CLIENT_ID: z.string().optional(),
    TWITTER_CLIENT_SECRET: z.string().optional(),
    REDIS_URL: z.string().optional().default("placeholder"),
    UPSTASH_REDIS_REST_URL: z.string().optional().default("placeholder"),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional().default("placeholder"),
    ELEVENLABS_API_KEY: z.string().optional().default("placeholder"),
    TAVILY_API_KEY: z.string().optional().default("placeholder"),
    EXA_API_KEY: z.string().optional().default("placeholder"),
    VALYU_API_KEY: z.string().optional().default("placeholder"),
    TMDB_API_KEY: z.string().optional().default("placeholder"),
    YT_ENDPOINT: z.string().optional().default("placeholder"),
    FIRECRAWL_API_KEY: z.string().optional().default("placeholder"),
    NOTTE_API_KEY: z.string().optional().default("placeholder"),
    PARALLEL_API_KEY: z.string().optional().default("placeholder"),
    OPENWEATHER_API_KEY: z.string().optional().default("placeholder"),
    GOOGLE_MAPS_API_KEY: z.string().optional().default("placeholder"),
    AMADEUS_API_KEY: z.string().optional().default("placeholder"),
    AMADEUS_API_SECRET: z.string().optional().default("placeholder"),
    CRON_SECRET: z.string().optional().default("placeholder"),
    BLOB_READ_WRITE_TOKEN: z.string().optional().default("placeholder"),
    SMITHERY_API_KEY: z.string().optional().default("placeholder"),
    COINGECKO_API_KEY: z.string().optional().default("placeholder"),
    SUPADATA_API_KEY: z.string().optional().default("placeholder"),
    QSTASH_TOKEN: z.string().optional().default("placeholder"),
    RESEND_API_KEY: z.string().optional().default("placeholder"),
    SUPERMEMORY_API_KEY: z.string().optional().default("placeholder"),
    SPOTIFY_CLIENT_ID: z.string().optional().default("placeholder"),
    SPOTIFY_CLIENT_SECRET: z.string().optional().default("placeholder"),
    MCP_CREDENTIALS_ENCRYPTION_KEY: z.string().optional().default("placeholder"),
    MCP_OAUTH_CALLBACK_ORIGIN: z.string().optional().default("placeholder"),
    ALLOWED_ORIGINS: z.string().optional().default('http://localhost:3000'),
    GITHUB_MCP_CLIENT_ID: z.string().optional().default("placeholder"),
    GITHUB_MCP_CLIENT_SECRET: z.string().optional().default("placeholder"),
    BOX_MCP_CLIENT_ID: z.string().optional().default("placeholder"),
    BOX_MCP_CLIENT_SECRET: z.string().optional().default("placeholder"),
    DROPBOX_MCP_CLIENT_ID: z.string().optional().default("placeholder"),
    DROPBOX_MCP_CLIENT_SECRET: z.string().optional().default("placeholder"),
    SLACK_MCP_CLIENT_ID: z.string().optional().default("placeholder"),
    SLACK_MCP_CLIENT_SECRET: z.string().optional().default("placeholder"),
    HUBSPOT_MCP_CLIENT_ID: z.string().optional().default("placeholder"),
    HUBSPOT_MCP_CLIENT_SECRET: z.string().optional().default("placeholder"),
    UPSTASH_BOX_API_KEY: z.string().optional().default("placeholder"),
  },
  experimental__runtimeEnv: process.env,
});

const REQUIRED_VARS = new Set(['DATABASE_URL', 'BETTER_AUTH_SECRET']);

for (const [key, value] of Object.entries(serverEnv)) {
  if (!REQUIRED_VARS.has(key) && value === 'placeholder') {
    console.warn(`[env] ${key} is not set (placeholder)`);
  }
}
