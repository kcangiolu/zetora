# Zetora — Architecture Overview

Zetora is a self-hosted, AI-powered agentic search engine — a fork of [Scira](https://github.com/zaidmukaddam/scira) by Zaid Mukaddam. It combines a Next.js application with a full Docker stack of supporting services (database, caches, object storage, vector store, metasearch, TTS/STT, job queue, code sandbox).

## Tech stack

| Layer                   | Technology                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Framework               | Next.js 16 (App Router, standalone output, React 19, React Compiler)                                                                    |
| Language                | TypeScript (strict), checked with `tsgo` (`@typescript/native-preview`)                                                                 |
| AI                      | Vercel AI SDK v6 (`ai`) + many providers (`@ai-sdk/*`, OpenRouter, Ollama, custom OpenAI-compatible providers)                          |
| UI                      | Tailwind CSS v4, Shadcn/Radix UI, Framer Motion, ECharts/visx/Recharts                                                                  |
| Auth                    | Better Auth (email + password, optional GitHub / Google / Twitter / Microsoft OAuth, 2FA)                                               |
| ORM / DB                | Drizzle ORM + PostgreSQL 17 (migrations in `drizzle/migrations`)                                                                        |
| Caching / rate limiting | Redis (`ioredis` / `redis`), sliding-window rate limiting via Redis sorted sets                                                         |
| Object storage          | Any S3-compatible service: bundled Silo (MinIO fork), Cloudflare R2, AWS S3... (`S3_*`)                                                 |
| Vector store            | Qdrant (search-result cache, hybrid search)                                                                                             |
| Web search              | SearXNG (self-hosted metasearch), fastCRW (Firecrawl-compatible scraper), plus SaaS fallbacks (Tavily, Exa, Firecrawl, Valyu, Parallel) |
| Long-term memory        | Native, in Postgres (`lib/memory`) — bio + facts, no extra service                                                                      |
| Job scheduling          | BullMQ + dedicated Redis (self-hosted alternative to QStash) — powers "Lookouts" (scheduled searches)                                   |
| Code sandbox            | Docker-based code interpreter (`onyxdotapp/code-interpreter`) or Daytona (SaaS)                                                         |
| Voice                   | Qwen3 TTS (`tts-service/`), NVIDIA Parakeet STT (`stt-service/`), speech-to-speech relay (`s2s-service/`); ElevenLabs / xAI as SaaS     |
| Email                   | SMTP (nodemailer), templates in `components/emails` (react-email)                                                                       |

## Repository layout

```
app/                    Next.js App Router
  (auth)/ (content)/ (search)/   Route groups (sign-in, About/Privacy, main search UI)
  api/                  API routes (see below)
  actions/              Server actions (chats, user, preferences, push…)
  apps/ lookout/ new/ search/ searches/ settings/ share/ voice/  Pages
ai/                     AI provider layer
  catalog/              Model catalog built from models.dev: labs/hosts config, routing, reasoning options, role models
  providers.ts          Resolves a model id to its provider chain (lab API, then aggregators) or a custom provider
  native-models/        Native llama.cpp and Ollama language models
  models/               Client-safe model types and helpers
components/             React components (chat interface, message parts, search results, charts, maps…)
contexts/ hooks/        React contexts and hooks
env/server.ts           t3-env schema — all server env vars validated with Zod
lib/
  db/                   Drizzle schema and queries (one module per domain in queries/)
  tools/                AI tools (web search, extreme search, stock charts, flights, YouTube, Reddit, X, maps, code interpreter…)
  search/               Search orchestration (search groups, tool loader, auto-router, context budget)
  memory/               Native long-term memory (bio + facts: injection, per-turn update, consolidation)
  mcp/                  MCP client, OAuth flows, credential encryption
  sandbox/              Code execution providers (docker / daytona)
  vector/               Qdrant integration (content indexer, hybrid search, cache cleanup)
  anonymizer/           Optional PII pseudonymization before prompts leave the instance
  hermes/               Hermes Agent connector (experimental, behind NEXT_PUBLIC_HERMES_ENABLED)
  canvas/ skills/       Canvas rendering registry, skill catalog
  net/                  Outbound fetch guards (public-URL checks, capped downloads)
  services/             BullMQ (lookout scheduling)
  auth.ts               Better Auth configuration
drizzle/                SQL migrations (drizzle/migrations) and create_indexes.sql
tts-service/ stt-service/ s2s-service/   Python voice services
presidio-service/       PII detection service for the anonymizer
hermes-relay-service/   Relay between users' Hermes gateways and the app
hermes-plugin/zetora/   Hermes plugin, installed on a user's gateway: tool calls as steps, Zetora memory for Hermes
searxng/                SearXNG settings
scripts/                Migration runner (db-migrate container), Daytona snapshot setup
public/                 Static assets
docs/screenshots/       Images shown in the README
```

## API routes (`app/api`)

| Route                                             | Purpose                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `search` (POST)                                   | Main chat/search endpoint — streams AI responses with tools       |
| `search/[id]/stream`, `search/[id]/stop`          | Resumable stream reconnect / stop                                 |
| `auth/[...all]`                                   | Better Auth handler                                               |
| `upload`, `downloads`, `proxy-image`              | File uploads, generated files, image proxying                     |
| `export/docx`, `export/pdf`                       | Chat export                                                       |
| `lookout`                                         | Scheduled search execution (QStash callback)                       |
| `mcp/*`                                           | MCP server CRUD, OAuth flows, elicitation, apps bridge            |
| `models`, `instance/capabilities`                 | Model picker catalog, what this instance has configured           |
| `custom-providers*`                               | Custom OpenAI-compatible provider management (detect, models)     |
| `tts/stream`, `transcribe`                        | Voice synthesis, transcription                                    |
| `voice/cloud-session`, `voice/local-session`      | Cloud (xAI) and local speech-to-speech sessions                   |
| `voice/hermes`                                    | Hermes Agent replies for local voice (s2s-service)                |
| `voice/transcript`                                | Saves local voice turns as a chat (s2s-service)                   |
| `v1/chat/completions`                             | OpenAI-compatible endpoint (used by the speech-to-speech service) |
| `hermes/*`, `internal/hermes/*`                   | Hermes Agent connector (user side / relay side)                   |
| `og/*`, `link-metadata`                           | Share images, link previews                                       |
| `diagnostics/services`                            | Health of the configured services, for Settings                   |
| `suggest`, `raycast`, `preferences`               | Misc features                                                     |

## Environment & configuration

- `env/server.ts` validates all server env vars (t3-env + Zod). Only `DATABASE_URL` and `BETTER_AUTH_SECRET` are needed to boot; a feature whose configuration is missing fails with an error naming the variable to set.
- `.env.example` documents every variable; `.env` feeds Docker, `.env.local` feeds `pnpm dev` and `drizzle-kit`.
- `next.config.ts` sets `output: 'standalone'` (for the Docker runner stage), React Compiler, security headers and MathJax font aliases for both Turbopack and Webpack.

## Docker stack (`docker-compose.yml`)

All services live on the `zetora-network` bridge. By default only Postgres, Redis, the migrations and the app start; every other service is behind a profile (see the table atop `docker-compose.yml`). Internal services bind to `127.0.0.1`; the ones a browser or a remote gateway must reach are published on all interfaces and meant to sit behind a reverse proxy with TLS.

| Service                           | Image                                   | Profile  | Host port             | Role                                                    |
| --------------------------------- | --------------------------------------- | -------- | --------------------- | ------------------------------------------------------- |
| `zetora.app`                      | `Dockerfile`, target `runner`           | —        | 3333                  | Next.js app                                             |
| `db-migrate`                      | `Dockerfile`, target `migrate`          | —        | —                     | Runs Drizzle migrations and `create_indexes.sql`, exits |
| `postgres`                        | postgres:17-alpine                      | —        | 127.0.0.1:5432        | Primary DB                                              |
| `redis`                           | redis:7-alpine                          | —        | 127.0.0.1:6379        | Cache, resumable streams, rate limits                   |
| `minio` (+ `minio-create-bucket`) | pgsty/silo                              | minio    | 9010, 127.0.0.1:9001  | S3 storage (API public for direct downloads) + console  |
| `qdrant`                          | qdrant/qdrant                           | qdrant   | 127.0.0.1:6333/6334   | Vector cache, hybrid search                             |
| `searxng` (+ `searxng-redis`)     | searxng/searxng                         | searxng  | 127.0.0.1:8090        | Metasearch                                              |
| `fastcrw` (+ `chrome`)            | ghcr.io/us/crw, chromedp/headless-shell | fastcrw  | 127.0.0.1:3004        | Scraper/search (Firecrawl-compatible)                   |
| `sandbox`                         | onyxdotapp/code-interpreter             | sandbox  | 127.0.0.1:8003        | Python code execution (root, host Docker socket)        |
| `presidio-api`                    | `presidio-service/`                     | presidio | 127.0.0.1:8004        | PII detection for the anonymizer                        |
| `bullmq-redis` (+ `bullboard`)    | redis:7-alpine, nauverse/bull-board     | bullmq   | 127.0.0.1:6381, :3001 | Lookout job queue and its dashboard                     |
| `qwen3-tts`                       | `tts-service/` (NVIDIA GPU)             | tts      | 127.0.0.1:8585        | Text-to-speech                                          |
| `stt-service`                     | `stt-service/` (NVIDIA GPU)             | voice    | 127.0.0.1:9002        | Speech-to-text (NVIDIA Parakeet)                        |
| `s2s-service`                     | `s2s-service/`                          | voice    | 8100                  | Local speech-to-speech relay (browser WebSocket)        |
| `hermes-relay-service`            | `hermes-relay-service/`                 | hermes   | 8201                  | Relay for users' Hermes gateways                        |

The `selfhosted` profile groups the CPU-only services, from `minio` to `bullmq`. Third-party images are pinned to a version. `Dockerfile` stages: `deps` → `builder` (Next.js build with placeholder secrets) → `runner` (standalone output), plus `migrate`.

## Key flows

1. **Search/chat**: `POST /api/search` → auth + rate limiting → model selection (`ai/providers.ts`, `lib/search/auto-router.ts`) → `streamText` with tools loaded per search group (`lib/search/group-config.ts`, `tool-loader.ts`) → results streamed to the client (resumable via `ai-resumable-stream` + Redis); chats persisted through Drizzle (`lib/db/queries/`).
2. **Web search tools**: SearXNG/fastCRW first when configured, SaaS providers otherwise; scraped content can be embedded and cached in Qdrant (`lib/vector`).
3. **Lookouts**: user-scheduled searches, run by `lib/lookout/run.ts`. With BullMQ (`lib/services/bullmq.ts`) the worker started in `instrumentation.ts` runs them in-process; with QStash they come back through `/api/lookout`. The database is the source of truth: an active recurring Lookout has a schedule, a paused or archived one has none, and each run claims the Lookout atomically, so a run of a paused, archived, already running or rescheduled Lookout is skipped.
4. **Memory** (`lib/memory`): a user-editable bio and atomic facts in Postgres. The bio and core facts go into the system prompt; other facts are matched lexically against the message and appended to it. After each answer, the conversation's own model (or a dedicated one) proposes memory changes through structured output, validated in code (new facts stay candidates until confirmed in another chat); a weekly consolidation merges and re-tiers them. A user's Hermes gateway shares this memory through `hermes-plugin/zetora` and `internal/hermes/memory`; its turns are updated by the dedicated model, or by Hermes's own model with the result validated the same way.
5. **Access**: no paid tiers — every signed-in account has full access; a per-account daily message cap (`ZETORA_DAILY_MESSAGE_LIMIT`, 500 by default, 0 for none) enforced via counters in Postgres/Redis guards against abuse.

## Security & resilience notes

- **Server-side proxies** (`/api/proxy-image`) never accept the upstream URL from a client header. The image proxy allows only http(s), blocks private/reserved IP ranges (re-checked on every redirect hop), and restricts responses to `image/*` capped at 10 MB with a 10 s timeout.
- **Scheduled search callbacks** (`/api/lookout`) answer only with `LOOKOUT_SCHEDULER=qstash`, and require the `CRON_SECRET` shared secret (sent through QStash as `Upstash-Forward-x-lookout-secret`). The endpoint returns 503 when the secret is unset so a forgotten env var fails closed.
- **Rate limiting** (`lib/rate-limit.ts`) is built lazily and fails closed: if `REDIS_URL` isn't configured, unauthenticated requests are denied rather than crashing the route.
- **SQL**: all Drizzle `sql` template interpolations are parameterized (no `sql.raw`), so raw string concatenation is not a SQL-injection vector.
- **Headers** (`next.config.ts`): `X-Frame-Options: DENY` (except public legal pages), `nosniff`, `Referrer-Policy`, HSTS and a `Permissions-Policy`. Optimized SVGs are served inert (CSP sandbox + `Content-Disposition: attachment`). `proxy.ts` sets a per-request nonce CSP (`lib/csp.ts`), currently in report-only mode until every page has been checked against it.
- **Auth origins**: Better Auth `trustedOrigins`/`allowedOrigins` derive from `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_BASE_URL` and the optional `ALLOWED_ORIGINS` list, so a self-hosted fork works without code edits.
- **Custom AI providers** are stored per-user in that user's preferences (`zetora-custom-providers`); the only instance-wide source is the admin-controlled `CUSTOM_AI_PROVIDERS` env var — there is no cross-user overwrite.
- **Environment validation**: `env/server.ts` (t3-env + Zod) validates every server var at startup and logs an `[env]` warning for each one left at its `"placeholder"` default.

## Tooling

- `pnpm lint` — ESLint 10 flat config (`eslint.config.mjs`). The React Compiler rules from `eslint-plugin-react-hooks` v7 run as warnings (pre-existing findings, non-blocking); `rules-of-hooks` and `exhaustive-deps` keep their defaults.
- `pnpm typecheck` — `tsgo` (TypeScript native preview).
- `pnpm test` / `test:coverage` — Vitest unit tests for pure/business-logic modules (`tests/`).
- `pnpm build` — Next.js standalone build.
- `pnpm knip` — unused files, exports and dependencies.
- CI (`.github/workflows/ci.yml`) runs lint, knip, typecheck, tests, build and a `docker compose config` check on every push and pull request to `main`.
