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
      'zetora-storage-provider'?: 'cloudflare-r2' | 'minio';
      'zetora-email-provider'?: 'resend' | 'smtp';
      'zetora-extreme-content-provider'?: 'exa-firecrawl' | 'searxng-fastcrw' | 'notte-only';
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
      /**
       * Opaque per-extension connector modes (C4) — e.g. the agent overlay's
       * off/read-only/full per-infra-server toggles. Keys and values are
       * meaningless to the core; only the registering extension interprets
       * them (agent/connector-modes.ts).
       */
      'zetora-extension-connectors'?: Record<string, string>;
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
      'zetora-tertiary-followup-model'?: string;
      'zetora-tertiary-followup-provider'?: string;
      'zetora-tertiary-followup-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
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
      'zetora-memory-provider'?: 'supermemory' | 'graphiti';
      'zetora-graphiti-llm-model'?: string;
      'zetora-graphiti-llm-base-url'?: string;
      'zetora-graphiti-llm-api-key'?: string;
      'zetora-graphiti-active-provider'?: string;
      'zetora-graphiti-embedding-provider'?: string;
      'zetora-graphiti-embedding-model'?: string;
      'zetora-embedding-enabled'?: boolean;
      'zetora-xml-tool-parsing-enabled'?: boolean;
      'zetora-fallback-firecrawl-content'?: boolean;
      'zetora-fallback-metadata'?: boolean;
      'zetora-fallback-notte'?: boolean;
      'zetora-fallback-exa-browse'?: boolean;
      'zetora-fallback-search-firecrawl'?: boolean;
      'zetora-fallback-retrieve-parallel'?: boolean;
      'zetora-fallback-retrieve-firecrawl'?: boolean;
      'zetora-fallback-retrieve-fastcrw'?: boolean;
      'zetora-fallback-retrieve-exa'?: boolean;
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
      'zetora-tertiary-agent-worker-model'?: string;
      'zetora-tertiary-agent-worker-provider'?: string;
      'zetora-tertiary-agent-worker-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
      'zetora-tertiary-agent-guard-model'?: string;
      'zetora-tertiary-agent-guard-provider'?: string;
      'zetora-tertiary-agent-guard-effort'?: 'auto' | 'low' | 'medium' | 'high' | 'off';
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
// URLs). Distinct from user-uploaded files, which are derived on read from
// message.parts + an R2 prefix listing instead of a dedicated table — see
// app/api/upload/route.ts.
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
