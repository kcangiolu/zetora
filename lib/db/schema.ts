import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  json,
  varchar,
  integer,
  uuid,
  real,
  index,
  uniqueIndex,
  primaryKey,
  customType,
} from 'drizzle-orm/pg-core';
import { generateId } from 'ai';
import { InferSelectModel } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { MemoryCategory, MemoryDurability, MemoryStatus, MemoryTier } from '@/lib/memory/constants';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    verified: boolean('verified').default(true).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('twoFactor_userId_idx').on(table.userId)],
);

export const chat = pgTable(
  'chat',
  {
    id: text('id')
      .primaryKey()
      .notNull()
      .$defaultFn(() => uuidv7()),
    userId: text('userId')
      .notNull()
      .references(() => user.id),
    title: text('title').notNull().default('New Chat'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    isPinned: boolean('is_pinned').notNull().default(false),
    visibility: varchar('visibility', { enum: ['public', 'private'] })
      .notNull()
      .default('private'),
  },
  (table) => [
    index('chat_userId_idx').on(table.userId),
    index('chat_userId_createdAt_idx').on(table.userId, table.createdAt),
    index('chat_userId_isPinned_updatedAt_idx').on(table.userId, table.isPinned, table.updatedAt),
  ],
);

// tsvector has no first-class Drizzle column builder. Populated exclusively by a
// DB trigger (see drizzle/migrations/*_message_search_vector_trigger.sql) — Drizzle
// never writes to it directly.
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const message = pgTable(
  'message',
  {
    id: text('id')
      .primaryKey()
      .notNull()
      .$defaultFn(() => generateId()),
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // user, assistant, or tool
    parts: json('parts').notNull(), // Store parts as JSON in the database
    attachments: json('attachments').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    completionTime: real('completion_time'),
    // Populated by a BEFORE INSERT OR UPDATE OF parts trigger, not by the app.
    // Nullable: existing rows are NULL until the one-time backfill runs; every row
    // inserted after the trigger migration gets it set automatically.
    searchVector: tsvector('search_vector'),
    // Marks the (at most one per chat) synthetic assistant message that holds
    // the automatic context-compaction summary — see lib/search/context-compaction.ts.
    // This message's own createdAt IS the compaction cutoff: any other message
    // with createdAt <= this one's is considered represented by the summary and
    // excluded from what's sent to the model. No separate cutoff column needed.
    isCompactionSummary: boolean('is_compaction_summary').notNull().default(false),
    // How many original messages the current summary text represents — display
    // only ("Summary of N earlier messages"), null for every non-summary message.
    compactionReplacedCount: integer('compaction_replaced_count'),
    // Hermes's `react` op (docs/relay-connector-contract.md §4): the agent's own
    // best-effort processing-lifecycle ack (👀 seen → ✅/❌ done) on a USER message it
    // received — never on its own replies. Stores only the current emoji (each `react`
    // call replaces it outright, matching the contract's own semantics — it isn't a
    // multi-user reaction list); null when absent or explicitly removed
    // (action.remove === true). Every non-Hermes message leaves this null forever.
    hermesReaction: text('hermes_reaction'),
    // The Hermes gateway (hermes_connector.gatewayId) that produced this assistant
    // message — provenance for the message's info popover, captured at write time so a
    // later re-enrollment from another machine can't rewrite who answered. Null for
    // every non-Hermes message and for user messages.
    hermesGatewayId: text('hermes_gateway_id'),
  },
  (table) => [
    index('message_chatId_idx').on(table.chatId),
    index('message_chatId_createdAt_idx').on(table.chatId, table.createdAt),
    // NOTE: the GIN index on search_vector is intentionally NOT declared here.
    // It's created by hand via CREATE INDEX CONCURRENTLY (see create_indexes.sql)
    // to avoid locking this hot table during migration.
  ],
);

export const stream = pgTable(
  'stream',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    chatId: text('chatId')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => [index('stream_chatId_idx').on(table.chatId)],
);

// Message usage tracking table
export const messageUsage = pgTable(
  'message_usage',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    messageCount: integer('message_count').notNull().default(0),
    date: timestamp('date').notNull().defaultNow(),
    resetAt: timestamp('reset_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('messageUsage_userId_idx').on(table.userId),
    index('messageUsage_userId_date_idx').on(table.userId, table.date),
    // Unique constraint for atomic upserts (one record per user per day)
    uniqueIndex('messageUsage_userId_date_unique').on(table.userId, table.date),
  ],
);

// Custom instructions table
export const customInstructions = pgTable(
  'custom_instructions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [index('customInstructions_userId_idx').on(table.userId)],
);

// User preferences table
export const userPreferences = pgTable('user_preferences', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  preferences: json('preferences')
    .$type<{
      'zetora-search-provider'?: 'exa' | 'parallel' | 'firecrawl' | 'searxng' | 'fastcrw';
      'zetora-github-search-provider'?: 'firecrawl' | 'searxng' | 'fastcrw';
      'zetora-github-search-fallback-enabled'?: boolean;
      'zetora-github-search-fallback-provider'?: 'firecrawl' | 'searxng' | 'fastcrw';
      'zetora-academic-search-provider'?: 'exa' | 'firecrawl' | 'searxng' | 'fastcrw';
      'zetora-academic-search-fallback-enabled'?: boolean;
      'zetora-academic-search-fallback-provider'?: 'exa' | 'firecrawl' | 'searxng' | 'fastcrw';
      'zetora-storage-provider'?: 'cloudflare-r2' | 'minio';
      'zetora-email-provider'?: 'resend' | 'smtp';
      'zetora-extreme-search-provider'?: 'exa' | 'firecrawl' | 'searxng' | 'fastcrw';
      'zetora-extreme-search-fallback-enabled'?: boolean;
      'zetora-extreme-search-fallback-provider'?: 'exa' | 'firecrawl' | 'searxng' | 'fastcrw';
      'zetora-extreme-content-provider'?: 'exa' | 'firecrawl' | 'fastcrw' | 'notte' | 'parallel';
      'zetora-extreme-content-fallback-enabled'?: boolean;
      'zetora-extreme-content-fallback-provider'?: 'exa' | 'firecrawl' | 'fastcrw' | 'notte' | 'parallel';
      'zetora-tertiary-extreme-agent-model'?: string;
      'zetora-tertiary-extreme-agent-provider'?: string;
      'zetora-tertiary-extreme-agent-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-group-order'?: string[];
      'zetora-model-order-global'?: string[];
      'zetora-blur-personal-info'?: boolean;
      'zetora-custom-instructions-enabled'?: boolean;
      'zetora-scroll-to-latest-on-open'?: boolean;
      'zetora-location-metadata-enabled'?: boolean;
      'zetora-auto-router-enabled'?: boolean;
      'zetora-auto-router-config'?: {
        routes: Array<{
          name: string;
          description: string;
          model: string;
        }>;
      };
      'zetora-preferred-models'?: string[];
      /** @deprecated superseded by zetora-enabled-sources; read as a one-time migration fallback. */
      'zetora-visible-modes'?: string[];
      /** Source ids the model may use; empty/absent = all enabled. */
      'zetora-enabled-sources'?: string[];
      /** Skill ids explicitly turned off; empty/absent = all enabled. */
      'zetora-disabled-skills'?: string[];
      'zetora-default-group'?:
        | 'auto'
        | 'web'
        | 'x'
        | 'academic'
        | 'youtube'
        | 'spotify'
        | 'reddit'
        | 'github'
        | 'stocks'
        | 'chat'
        | 'extreme'
        | 'crypto'
        | 'code'
        | 'connectors'
        | 'mcp'
        | 'multi-agent'
        | 'prediction'
        | 'canvas';
      'zetora-sandbox-provider'?: 'daytona' | 'docker';
      'zetora-custom-providers'?: Array<{
        id: string;
        name: string;
        baseURL: string;
        apiKey?: string;
        disableAutoDetect?: boolean;
        anonymize?: boolean;
        backendKind?: 'ollama' | 'vllm' | 'llamacpp' | 'openai' | 'unknown';
      }>;
      'zetora-anonymization-enabled'?: boolean;
      'zetora-anonymization-custom-terms'?: string[];
      'zetora-anonymization-fail-open'?: boolean;
      'zetora-anonymization-language'?: 'en' | 'fr';
      'zetora-anonymization-ner-enabled'?: boolean;
      'zetora-embedding-provider'?: string;
      'zetora-embedding-model'?: string;
      'zetora-file-embedding-provider'?: 'cohere' | 'custom';
      'zetora-qdrant-enabled'?: boolean;
      'zetora-hybrid-search-enabled'?: boolean;
      'zetora-content-indexing-enabled'?: boolean;
      'zetora-rerank-enabled'?: boolean;
      'zetora-tertiary-chat-title-model'?: string;
      'zetora-tertiary-chat-title-provider'?: string;
      'zetora-tertiary-chat-title-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-tertiary-chat-title-enabled'?: boolean;
      'zetora-tertiary-followup-model'?: string;
      'zetora-tertiary-followup-provider'?: string;
      'zetora-tertiary-followup-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-tertiary-followup-enabled'?: boolean;
      'zetora-tertiary-enhance-model'?: string;
      'zetora-tertiary-enhance-provider'?: string;
      'zetora-tertiary-enhance-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-tertiary-tool-repair-model'?: string;
      'zetora-tertiary-tool-repair-provider'?: string;
      'zetora-tertiary-tool-repair-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-tertiary-auto-router-model'?: string;
      'zetora-tertiary-auto-router-provider'?: string;
      'zetora-tertiary-auto-router-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-tertiary-translate-text-model'?: string;
      'zetora-tertiary-translate-text-provider'?: string;
      'zetora-tertiary-translate-text-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-tertiary-translate-vision-model'?: string;
      'zetora-tertiary-translate-vision-provider'?: string;
      'zetora-tertiary-translate-vision-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-tertiary-lang-detect-model'?: string;
      'zetora-tertiary-lang-detect-provider'?: string;
      'zetora-tertiary-lang-detect-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-tertiary-extreme-planner-model'?: string;
      'zetora-tertiary-extreme-planner-provider'?: string;
      'zetora-tertiary-extreme-planner-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-default-model'?: string;
      'zetora-default-provider'?: string;
      'zetora-default-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-lockout-provider'?: 'qstash' | 'bullmq';
      'zetora-embedding-enabled'?: boolean;
      'zetora-xml-tool-parsing-enabled'?: boolean;
      'zetora-fallback-metadata'?: boolean;
      'zetora-fallback-notte'?: boolean;
      'zetora-fallback-search-firecrawl'?: boolean;
      'zetora-retrieve-provider'?: 'fastcrw' | 'exa' | 'parallel' | 'firecrawl';
      'zetora-retrieve-fallback-enabled'?: boolean;
      'zetora-retrieve-fallback-provider'?: 'fastcrw' | 'exa' | 'parallel' | 'firecrawl';
      'zetora-reddit-search-provider'?: 'parallel' | 'firecrawl' | 'searxng' | 'fastcrw';
      'zetora-reddit-search-fallback-enabled'?: boolean;
      'zetora-reddit-search-fallback-provider'?: 'parallel' | 'firecrawl' | 'searxng' | 'fastcrw';
      'zetora-search-fallback-provider'?: 'firecrawl' | 'exa' | 'parallel' | 'searxng' | 'fastcrw' | 'none';
      'zetora-tts-provider'?: 'elevenlabs' | 'openai-compatible';
      'zetora-tts-custom-provider-id'?: string;
      'zetora-tts-openai-model'?: string;
      'zetora-tts-openai-voice'?: string;
      'zetora-tts-openai-language'?: string;
      'zetora-stt-provider'?: 'elevenlabs' | 'openai-compatible';
      'zetora-stt-custom-provider-id'?: string;
      'zetora-stt-openai-model'?: string;
      'zetora-voice-s2s-backend'?: 'cloud' | 'local';
      'zetora-tertiary-voice-model'?: string;
      'zetora-tertiary-voice-provider'?: string;
      'zetora-tertiary-voice-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-memory-curator-enabled'?: boolean;
      'zetora-tertiary-memory-curator-model'?: string;
      'zetora-tertiary-memory-curator-provider'?: string;
      'zetora-tertiary-memory-curator-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      /** Full replacement for Auto mode's built-in system prompt; empty/absent = use the default (lib/search/groups/auto.ts). */
      'zetora-system-prompt-override'?: string;
      'zetora-system-prompt-presets'?: Array<{ id: string; name: string; prompt: string }>;
    }>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Lookout table for scheduled searches
export const lookout = pgTable(
  'lookout',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    prompt: text('prompt').notNull(),
    frequency: text('frequency').notNull(), // 'once', 'daily', 'weekly', 'monthly', 'yearly'
    cronSchedule: text('cron_schedule').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    nextRunAt: timestamp('next_run_at').notNull(),
    qstashScheduleId: text('qstash_schedule_id'),
    status: text('status').notNull().default('active'), // 'active', 'paused', 'archived', 'running'
    searchMode: text('search_mode').notNull().default('extreme'), // Search mode: 'extreme', 'web', 'academic', 'youtube', 'reddit', 'github', 'stocks', 'crypto', 'code', 'x', 'chat'
    lastRunAt: timestamp('last_run_at'),
    lastRunChatId: text('last_run_chat_id'),
    // Store all run history as JSON
    runHistory: json('run_history')
      .$type<
        Array<{
          runAt: string; // ISO date string
          chatId: string;
          status: 'success' | 'error' | 'timeout';
          error?: string;
          duration?: number; // milliseconds
          tokensUsed?: number;
          searchesPerformed?: number;
        }>
      >()
      .default([]),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('lookout_userId_idx').on(table.userId),
    index('lookout_userId_status_idx').on(table.userId, table.status),
  ],
);

// Reversible pseudonym vault for the anonymization layer: maps a
// deterministic HMAC token (e.g. "⟦PERSON_ab12cd34ef⟧") back to the
// encrypted original value so user-facing boundaries can re-hydrate text
// that was tokenized before being sent to a cloud provider or tool.
export const piiAlias = pgTable(
  'pii_alias',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    entityType: text('entity_type').notNull(),
    originalEnc: text('original_enc').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.token] }), index('piiAlias_userId_idx').on(table.userId)],
);

export const piiAliasRelations = relations(piiAlias, ({ one }) => ({
  user: one(user, {
    fields: [piiAlias.userId],
    references: [user.id],
  }),
}));

export const userMcpServer = pgTable(
  'user_mcp_server',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    transportType: varchar('transport_type', { enum: ['http', 'sse'] })
      .notNull()
      .default('http'),
    url: text('url').notNull(),
    authType: varchar('auth_type', { enum: ['none', 'bearer', 'header', 'oauth'] })
      .notNull()
      .default('none'),
    encryptedCredentials: text('encrypted_credentials'),
    oauthIssuerUrl: text('oauth_issuer_url'),
    oauthAuthorizationUrl: text('oauth_authorization_url'),
    oauthTokenUrl: text('oauth_token_url'),
    oauthScopes: text('oauth_scopes'),
    oauthClientId: text('oauth_client_id'),
    oauthClientSecretEncrypted: text('oauth_client_secret_encrypted'),
    oauthAccessTokenEncrypted: text('oauth_access_token_encrypted'),
    oauthRefreshTokenEncrypted: text('oauth_refresh_token_encrypted'),
    oauthAccessTokenExpiresAt: timestamp('oauth_access_token_expires_at'),
    oauthConnectedAt: timestamp('oauth_connected_at'),
    oauthError: text('oauth_error'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    disabledTools: json('disabled_tools').$type<string[]>().default([]),
    lastTestedAt: timestamp('last_tested_at'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('userMcpServer_userId_idx').on(table.userId),
    index('userMcpServer_userId_enabled_idx').on(table.userId, table.isEnabled),
  ],
);

// One connector per user: a Hermes Agent gateway (github.com/NousResearch/hermes-agent)
// the user runs themselves, linked to their Zetora account via the relay/connector
// protocol (see hermes-relay-service). gatewaySecretEncrypted is reversible
// (AES-256-GCM, lib/hermes/crypto.ts) rather than hashed: it's used as an HMAC key to
// verify the gateway's WS-upgrade bearer token, which requires recomputing the MAC
// from the raw secret — a one-way hash can't be used for that. enrollmentTokenHash is
// the opposite case (a short-lived provisioning code, checked "hash and compare" only)
// and is genuinely a one-way sha256 hash.
export const hermesConnector = pgTable(
  'hermes_connector',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Null until enrollment succeeds: the CLIENT (the user's `hermes gateway enroll`,
    // via --gateway-id or its own gw-<hostname> default) chooses this id, not us — see
    // hermes_cli/gateway_enroll.py. Postgres allows multiple NULLs under a unique
    // constraint, so many still-pending connectors coexisting is fine.
    gatewayId: text('gateway_id').unique(),
    label: text('label'),
    status: varchar('status', { enum: ['pending', 'enrolled', 'revoked'] })
      .notNull()
      .default('pending'),
    enrollmentTokenHash: text('enrollment_token_hash'),
    enrollmentTokenExpiresAt: timestamp('enrollment_token_expires_at'),
    gatewaySecretEncrypted: text('gateway_secret_encrypted'),
    gatewaySecretPrefix: text('gateway_secret_prefix'),
    lastConnectedAt: timestamp('last_connected_at'),
    lastDisconnectedAt: timestamp('last_disconnected_at'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('hermesConnector_userId_idx').on(table.userId),
    index('hermesConnector_gatewayId_idx').on(table.gatewayId),
  ],
);

// One row per Zetora chat that is bound to a Hermes connector. Kept separate from
// hermesConnector (rather than a column on it) so a future multi-conversation Hermes
// setup doesn't need a schema migration.
export const hermesConversation = pgTable(
  'hermes_conversation',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    chatId: text('chat_id')
      .notNull()
      .unique()
      .references(() => chat.id, { onDelete: 'cascade' }),
    connectorId: text('connector_id')
      .notNull()
      .references(() => hermesConnector.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('hermesConversation_connectorId_idx').on(table.connectorId)],
);

export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dhKey: text('p256dh_key').notNull(),
    authKey: text('auth_key').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at').notNull().defaultNow(),
  },
  (table) => [index('pushSubscription_userId_idx').on(table.userId)],
);

export const hermesConnectorRelations = relations(hermesConnector, ({ one, many }) => ({
  user: one(user, {
    fields: [hermesConnector.userId],
    references: [user.id],
  }),
  conversations: many(hermesConversation),
}));

export const hermesConversationRelations = relations(hermesConversation, ({ one }) => ({
  chat: one(chat, {
    fields: [hermesConversation.chatId],
    references: [chat.id],
  }),
  connector: one(hermesConnector, {
    fields: [hermesConversation.connectorId],
    references: [hermesConnector.id],
  }),
}));


export const pushSubscriptionRelations = relations(pushSubscription, ({ one }) => ({
  user: one(user, {
    fields: [pushSubscription.userId],
    references: [user.id],
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  chats: many(chat),
  messageUsages: many(messageUsage),
  customInstructions: many(customInstructions),
  userPreferences: many(userPreferences),
  lookouts: many(lookout),
  mcpServers: many(userMcpServer),
  piiAliases: many(piiAlias),
  generatedFiles: many(generatedFile),
  hermesConnector: many(hermesConnector),
  pushSubscriptions: many(pushSubscription),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, {
    fields: [chat.userId],
    references: [user.id],
  }),
  messages: many(message),
  streams: many(stream),
  hermesConversation: one(hermesConversation, {
    fields: [chat.id],
    references: [hermesConversation.chatId],
  }),
}));

export const messageRelations = relations(message, ({ one }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
}));

export const streamRelations = relations(stream, ({ one }) => ({
  chat: one(chat, {
    fields: [stream.chatId],
    references: [chat.id],
  }),
}));

export const lookoutRelations = relations(lookout, ({ one }) => ({
  user: one(user, {
    fields: [lookout.userId],
    references: [user.id],
  }),
}));

export const userMcpServerRelations = relations(userMcpServer, ({ one }) => ({
  user: one(user, {
    fields: [userMcpServer.userId],
    references: [user.id],
  }),
}));

// Files produced by AI tools (generated images, generated documents/charts),
// re-hosted on our own storage so they don't depend on an external
// provider's URL lifetime (e.g. a ComfyUI wrapper's short-lived signed
// URLs). User-uploaded files have their own table, uploadedFile below.
export const generatedFile = pgTable(
  'generated_file',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    chatId: text('chat_id').references(() => chat.id, { onDelete: 'set null' }),
    key: text('key').notNull(),
    url: text('url').notNull(),
    filename: text('filename').notNull(),
    mediaType: text('media_type'),
    kind: varchar('kind', { enum: ['image', 'document'] }).notNull(),
    toolName: text('tool_name'),
    sizeBytes: integer('size_bytes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('generatedFile_userId_idx').on(table.userId),
    index('generatedFile_userId_createdAt_idx').on(table.userId, table.createdAt),
  ],
);

export const generatedFileRelations = relations(generatedFile, ({ one }) => ({
  user: one(user, {
    fields: [generatedFile.userId],
    references: [user.id],
  }),
  chat: one(chat, {
    fields: [generatedFile.chatId],
    references: [chat.id],
  }),
}));

// Files the user uploaded (chat attachments), recorded once the browser's
// direct PUT to storage is confirmed (see app/api/upload/confirm). The bucket
// only holds the bytes: listing comes from here, ordered by createdAt, the
// same way generatedFile backs Settings → Downloads. chatId is filled in when
// the file is first saved as part of a message (see linkUploadedFilesToChats),
// since an upload usually happens before its chat exists.
export const uploadedFile = pgTable(
  'uploaded_file',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    chatId: text('chat_id').references(() => chat.id, { onDelete: 'set null' }),
    key: text('key').notNull(),
    url: text('url').notNull(),
    filename: text('filename').notNull(),
    mediaType: text('media_type'),
    sizeBytes: integer('size_bytes'),
    // Millisecond precision so the value round-trips exactly through a JS
    // Date, which the (createdAt, id) pagination cursor depends on.
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uploadedFile_key_idx').on(table.key),
    uniqueIndex('uploadedFile_url_idx').on(table.url),
    index('uploadedFile_userId_createdAt_id_idx').on(table.userId, table.createdAt, table.id),
  ],
);

export const uploadedFileRelations = relations(uploadedFile, ({ one }) => ({
  user: one(user, {
    fields: [uploadedFile.userId],
    references: [user.id],
  }),
  chat: one(chat, {
    fields: [uploadedFile.chatId],
    references: [chat.id],
  }),
}));

// Per-image opt-out from being resent to the model in future turns. Keyed by
// the image's own URL (globally unique, see lib/generated-file-storage.ts)
// rather than joining against generatedFile, since that table is written
// best-effort and can be missing a row for an image that's still in
// message.parts and still gets sent to the model.
export const hiddenContextImage = pgTable(
  'hidden_context_image',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('hiddenContextImage_chatId_imageUrl_idx').on(table.chatId, table.imageUrl)],
);

export const hiddenContextImageRelations = relations(hiddenContextImage, ({ one }) => ({
  chat: one(chat, {
    fields: [hiddenContextImage.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [hiddenContextImage.userId],
    references: [user.id],
  }),
}));

export type HiddenContextImage = InferSelectModel<typeof hiddenContextImage>;

// Native memory, part 1: a short free-text profile injected whole into every
// system prompt. `userText` is only ever written by the user; `autoText` is
// regenerated by memory consolidation (and editable by the user).
export const userBio = pgTable('user_bio', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  userText: text('user_text').notNull().default(''),
  autoText: text('auto_text').notNull().default(''),
  // Set when the user edits autoText — consolidation then rewrites from the
  // user's version instead of from scratch.
  autoEditedByUserAt: timestamp('auto_edited_by_user_at'),
  autoGeneratedAt: timestamp('auto_generated_at'),
  consolidatedAt: timestamp('consolidated_at'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Native memory, part 2: atomic facts about the user. See lib/memory/constants.ts
// for what each enum-like column means.
export const memoryEntry = pgTable(
  'memory_entry',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    category: text('category').$type<MemoryCategory>().notNull(),
    durability: text('durability').$type<MemoryDurability>().notNull(),
    tier: text('tier').$type<MemoryTier>().notNull(),
    status: text('status').$type<MemoryStatus>().notNull(),
    keywords: text('keywords').array().notNull().default([]),
    sensitive: boolean('sensitive').notNull().default(false),
    // Created or edited by the user: the model can no longer change it.
    userLocked: boolean('user_locked').notNull().default(false),
    // A candidate is only confirmed from a chat other than the one it came from.
    sourceChatId: text('source_chat_id').references(() => chat.id, { onDelete: 'set null' }),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull().defaultNow(),
  },
  (table) => [index('memoryEntry_userId_status_idx').on(table.userId, table.status)],
);

export type UserBio = InferSelectModel<typeof userBio>;
export type MemoryEntry = InferSelectModel<typeof memoryEntry>;

export const buildSession = pgTable(
  'build_session',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => generateId()),
    chatId: text('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    boxId: text('box_id'),
    runtime: text('runtime').notNull().default('node'),
    status: text('status').notNull().default('active'), // 'active', 'completed', 'error', 'deleted'
    snapshotId: text('snapshot_id'),
    totalCostUsd: real('total_cost_usd'),
    totalComputeMs: integer('total_compute_ms'),
    totalInputTokens: integer('total_input_tokens'),
    totalOutputTokens: integer('total_output_tokens'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('build_session_chatId_idx').on(table.chatId),
    index('build_session_userId_idx').on(table.userId),
    index('build_session_userId_status_idx').on(table.userId, table.status),
  ],
);

export const buildSessionRelations = relations(buildSession, ({ one }) => ({
  chat: one(chat, {
    fields: [buildSession.chatId],
    references: [chat.id],
  }),
  user: one(user, {
    fields: [buildSession.userId],
    references: [user.id],
  }),
}));

export type User = InferSelectModel<typeof user>;
export type Session = InferSelectModel<typeof session>;
export type Account = InferSelectModel<typeof account>;
export type Verification = InferSelectModel<typeof verification>;
export type Chat = InferSelectModel<typeof chat>;
export type Message = InferSelectModel<typeof message>;
export type Stream = InferSelectModel<typeof stream>;
export type MessageUsage = InferSelectModel<typeof messageUsage>;
export type CustomInstructions = InferSelectModel<typeof customInstructions>;
export type UserPreferences = InferSelectModel<typeof userPreferences>;
export type Lookout = InferSelectModel<typeof lookout>;
export type UserMcpServer = InferSelectModel<typeof userMcpServer>;
export type BuildSession = InferSelectModel<typeof buildSession>;
export type PiiAlias = InferSelectModel<typeof piiAlias>;
export type GeneratedFile = InferSelectModel<typeof generatedFile>;
export type UploadedFile = InferSelectModel<typeof uploadedFile>;
