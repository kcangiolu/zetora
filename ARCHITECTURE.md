# Zetora — Architecture Overview

Zetora is a self-hosted, AI-powered agentic search engine (fork of [Scira](https://github.com/zaidmukaddam/scira)). It combines a Next.js application with a full Docker stack of supporting services (database, caches, object storage, vector store, metasearch, knowledge graph, TTS/STT, job queue, code sandbox).

## Tech stack

| Layer                   | Technology                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Framework               | Next.js 16 (App Router, standalone output, React 19, React Compiler)                                                                    |
| Language                | TypeScript (strict), checked with `tsgo` (`@typescript/native-preview`)                                                                 |
| AI                      | Vercel AI SDK v6 (`ai`) + many providers (`@ai-sdk/*`, OpenRouter, Ollama, custom OpenAI-compatible providers)                          |
| UI                      | Tailwind CSS v4, Shadcn/Radix UI, Framer Motion, ECharts/visx/Recharts                                                                  |
| Auth                    | Better Auth (GitHub / Google / Twitter OAuth), Polar & DodoPayments plugins for billing                                                 |
| ORM / DB                | Drizzle ORM + PostgreSQL 17 (migrations in `drizzle/migrations`)                                                                        |
| Caching / rate limiting | Redis (`ioredis` / `redis`), Upstash-compatible REST via SRH (`hiett/serverless-redis-http`), `@upstash/ratelimit`                      |
| Object storage          | MinIO (S3-compatible) or Cloudflare R2 (`STORAGE_PROVIDER`)                                                                             |
| Vector store            | Qdrant (search-result cache, hybrid search)                                                                                             |
| Web search              | SearXNG (self-hosted metasearch), fastCRW (Firecrawl-compatible scraper), plus SaaS fallbacks (Tavily, Exa, Firecrawl, Valyu, Parallel) |
| Knowledge graph         | Graphiti (Python FastAPI service) backed by FalkorDB                                                                                    |
| Job scheduling          | BullMQ + dedicated Redis (self-hosted alternative to QStash) — powers "Lookouts" (scheduled searches)                                   |
| Code sandbox            | Docker-based code interpreter (`onyxdotapp/code-interpreter`) or Daytona (SaaS)                                                         |
| Voice                   | Qwen3 TTS (GPU, FastAPI, `tts-service/`) and faster-whisper STT; ElevenLabs as SaaS alternative                                         |
| Email                   | Resend or SMTP (nodemailer), templates in `components/emails` (react-email)                                                             |

## Repository layout

```
app/                    Next.js App Router
  (auth)/ (content)/ (search)/   Route groups (sign-in, legal pages, main search UI)
  api/                  API routes (see below)
  actions.ts            Server actions (~91 KB — chat, history, subscription, usage…)
  lookout/ new/ pricing/ search/ searches/ settings/ share/ voice/ xql/  Pages
ai/                     AI provider layer
  providers.ts          Model registry (zetora-default, -think, -vision… via gateway/custom providers)
  models.ts             Model catalog & capabilities (68 KB)
  xml-tool-middleware.ts XML tool-call parsing middleware for models without native tool support
components/             React components (chat interface, search results, charts, maps…)
contexts/ hooks/        React contexts and hooks
env/server.ts           t3-env schema — all server env vars validated with Zod
lib/
  db/                   Drizzle schema (26 KB) + queries (63 KB)
  tools/                ~40 AI tools (web search, extreme search, stock charts, flights, YouTube, Reddit, X, maps, code interpreter…)
  search/               Search orchestration (group-config 144 KB, tool-loader, auto-router)
  services/             BullMQ service (lookout scheduling)
  mcp/                  MCP client, OAuth flows, credential encryption
  sandbox/              Sandbox providers (docker / daytona)
  vector/               Qdrant integration (content indexer, hybrid search, cache cleanup)
  graphiti/             Graphiti API client
  canvas/               Canvas rendering registry (json-render)
  auth.ts               Better Auth configuration
  subscription.ts       Polar/Dodo subscription logic
drizzle/migrations/     SQL migrations (0000 → 0010)
graphiti-service/       Python FastAPI service (Graphiti + FalkorDB) + MCP server
tts-service/            Python Qwen3-TTS FastAPI service (GPU)
searxng/                SearXNG settings
scripts/migrate.js      Migration runner used by the db-migrate container
public/                 Static assets
```

## API routes (`app/api`)

| Route                                                                      | Purpose                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `search` (POST)                                                            | Main chat/search endpoint — streams AI responses with tools (73 KB route) |
| `search/[id]/stream`, `search/[id]/stop`                                   | Resumable stream reconnect / stop                                         |
| `auth/[...all]`                                                            | Better Auth handler                                                       |
| `upload`, `clean_images`, `proxy-image`                                    | File upload (S3/R2/Blob), image cleaning/proxying                         |
| `export/docx`, `export/pdf`                                                | Chat export                                                               |
| `lookout`                                                                  | Scheduled search execution (BullMQ/QStash callback)                       |
| `mcp/*`                                                                    | MCP server CRUD, OAuth flows, elicitation, apps bridge                    |
| `custom-providers*`                                                        | Custom OpenAI-compatible provider management (detect, models)             |
| `graphiti/[...path]`                                                       | Proxy to the Graphiti API                                                 |
| `tts/stream`, `transcribe`                                                 | Voice synthesis / transcription                                           |
| `suggest`, `xql`, `x-wrapped`, `raycast`, `preferences`, `provider-status` | Misc features                                                             |

## Environment & configuration

- `env/server.ts` validates all server env vars (t3-env + Zod). Only `DATABASE_URL` and `BETTER_AUTH_SECRET` are hard-required; everything else defaults to `"placeholder"` and degrades the matching feature.
- `.env.example` documents every variable; `.env` feeds Docker, `.env.local` feeds `pnpm dev` and `drizzle-kit`.
- `next.config.ts` sets `output: 'standalone'` (for the Docker runner stage), React Compiler, security headers (X-Frame-Options, nosniff, Referrer-Policy) and MathJax font aliases for both Turbopack and Webpack.

## Docker stack (`docker-compose.yml`)

All services live on the `zetora-network` bridge; only `zetora.app` (port 3333) is meant to be exposed. Everything else binds to `127.0.0.1`.

| Service                           | Image                                     | Host port       | Role                                  |
| --------------------------------- | ----------------------------------------- | --------------- | ------------------------------------- |
| `zetora.app`                      | built from `Dockerfile` (target `runner`) | 3333            | Next.js app                           |
| `db-migrate`                      | same image, target `migrate`              | —               | Runs Drizzle migrations, exits        |
| `postgres`                        | postgres:17-alpine                        | 5432            | Primary DB                            |
| `redis`                           | redis:7-alpine                            | 6379            | Cache / sessions / rate limits        |
| `srh`                             | hiett/serverless-redis-http               | —               | Upstash REST shim over `redis`        |
| `minio` (+ `minio-create-bucket`) | minio                                     | 9000/9001       | S3 storage + console                  |
| `qdrant`                          | qdrant                                    | 6333/6334       | Vector cache                          |
| `searxng` (+ `searxng-redis`)     | searxng                                   | 8080            | Metasearch                            |
| `fastcrw`                         | ghcr.io/us/crw                            | 3003            | Scraper/search (Firecrawl-compatible) |
| `sandbox`                         | onyxdotapp/code-interpreter               | 8003→8000       | Python code execution (docker.sock)   |
| `falkordb`                        | falkordb                                  | 6380→6379, 3002 | Graph DB                              |
| `graphiti-api` / `graphiti-mcp`   | built from `graphiti-service/`            | 8001 / 8002     | Knowledge graph API + MCP             |
| `bullmq-redis`                    | redis:7-alpine (port 6381, AOF)           | 6381            | BullMQ backing store                  |
| `bullboard`                       | nauverse/bull-board                       | 3001            | Queue dashboard                       |
| `qwen3-tts`                       | built from `tts-service/` (GPU, `profiles: [tts]`, opt-in) | 8585→8080 | Text-to-speech |
| `whisper-stt`                     | fedirz/faster-whisper-server              | 9002→8000       | Speech-to-text                        |

Build flow: `Dockerfile` has `deps` → `builder` (Next.js build with placeholder secrets) → `runner` (standalone output) and a `migrate` target (drizzle migrations + `create_indexes.sql`).

## Key flows

1. **Search/chat**: `POST /api/search` → auth + rate limiting → model selection (`ai/providers.ts`, `lib/search/auto-router.ts`) → `streamText` with tools loaded per search group (`lib/search/group-config.ts`, `tool-loader.ts`) → results streamed to the client (resumable via `ai-resumable-stream` + Redis); chats persisted through Drizzle (`lib/db/queries.ts`).
2. **Web search tools**: SearXNG/fastCRW first when configured, SaaS providers otherwise; scraped content can be embedded and cached in Qdrant (`lib/vector`).
3. **Lookouts**: user-scheduled searches; BullMQ repeatable jobs (`lib/services/bullmq.ts`) call back into `/api/lookout` (QStash used instead when BullMQ is disabled).
4. **Memory**: Graphiti knowledge graph (self-hosted) or Supermemory (SaaS).
5. **Billing**: Better Auth plugins for Polar and DodoPayments; free tier enforced via usage counters in Postgres/Redis.

## Security & resilience notes

- **Server-side proxies** (`/api/graphiti`, `/api/proxy-image`) never accept the upstream URL from a client header. Graphiti resolves the target from the authenticated user's saved preference; the image proxy allows only http(s), blocks private/reserved IP ranges (re-checked on every redirect hop), and restricts responses to `image/*` capped at 10 MB with a 10 s timeout.
- **Scheduled search callbacks** (`/api/lookout`) require the `CRON_SECRET` shared secret (sent as `x-lookout-secret`, or `Upstash-Forward-x-lookout-secret` through QStash). The endpoint returns 503 when the secret is unset so a forgotten env var fails closed. `/api/clean_images` follows the same rule.
- **Rate limiting** (`lib/rate-limit.ts`) is built lazily and fails closed: if Upstash/SRH isn't configured, unauthenticated requests are denied rather than crashing the route.
- **SQL**: all Drizzle `sql` template interpolations are parameterized (no `sql.raw`), so raw string concatenation is not a SQL-injection vector.
- **Headers** (`next.config.ts`): `X-Frame-Options: DENY` (except public legal pages), `nosniff`, `Referrer-Policy`, HSTS and a `Permissions-Policy`. Optimized SVGs are served inert (CSP sandbox + `Content-Disposition: attachment`). A global page CSP is intentionally **not** set: the app loads many third-party scripts/styles (analytics, maps, charts, embeds) and a strict policy would need per-source auditing — tracked as future work.
- **Auth origins**: Better Auth `trustedOrigins`/`allowedOrigins` derive from `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_BASE_URL` and the optional `ALLOWED_ORIGINS` list, so a self-hosted fork works without code edits.
- **Custom AI providers** are stored per-user in that user's preferences (`zetora-custom-providers`); the only instance-wide source is the admin-controlled `CUSTOM_AI_PROVIDERS` env var — there is no cross-user overwrite.
- **Environment validation**: `env/server.ts` (t3-env + Zod) validates every server var at startup; only `DATABASE_URL` and `BETTER_AUTH_SECRET` are required, everything else degrades its feature and logs a `[env]` warning when left at the `"placeholder"` default.

## Tooling

- `pnpm lint` — ESLint 10 flat config (`eslint.config.mjs`). The React Compiler rules from `eslint-plugin-react-hooks` v7 run as warnings (pre-existing findings, non-blocking); `rules-of-hooks` and `exhaustive-deps` keep their defaults.
- `pnpm typecheck` — `tsgo` (TypeScript native preview).
- `pnpm test` / `test:coverage` — Vitest unit tests for pure/business-logic modules (`tests/`).
- `pnpm build` — Next.js standalone build.
- CI runs all four on push/PR to `main` via `.gitea/workflows/ci.yml` (Gitea Actions must be enabled on the repo and a runner registered for it to execute).
