# Zetora

A fork of [Scira](https://github.com/zaidmukaddam/scira) by Zaid Mukaddam, extended into an agentic research platform.

Research at the speed of thought. The agentic research platform that plans, retrieves, and cites — so you can think faster.

Runs either way, your choice: entirely against managed cloud providers with zero extra infrastructure (the default — see [All-Cloud Configuration](#all-cloud-configuration)), or as a fully [self-hosted stack](#self-hosted-stack) where every cloud dependency has a local, opt-in alternative. Per-service, not all-or-nothing — self-host just your file storage while keeping cloud search, say.

## How It Works

1. **Ask anything** — Type a question, upload a PDF, or paste a URL. Toggle sources and skills, or let Auto decide the strategy for you.
2. **Zetora plans & retrieves** — The agent breaks your question into sub-tasks, searches live sources, and cross-checks the evidence.
3. **Get cited answers** — Receive a grounded answer with inline citations. Click any source to verify it yourself.

## Features

### Core Capabilities

- **Agentic Planning** — Breaks complex questions into steps, selects the right models and tools, then executes multi-step workflows end to end
- **Grounded Retrieval** — Every answer comes with inline citations you can click to audit the evidence yourself
- **Hybrid RAG** — Self-hosted vector search (Qdrant) with content indexing, RRF fusion, and Cohere reranking for file search
- **Skills** — 15 loadable research and generation skills (deep research, academic review, market intel, image generation, Office documents, …) picked automatically per message
- **Generation** — Image generation and editing with durable storage, plus document generation skills for .docx, .pptx, .pdf, and .xlsx
- **Privacy Layer** — Optional PII anonymization (Microsoft Presidio) that masks personal data before it reaches cloud providers
- **Extensible & Open** — AGPL-3.0 licensed. Self-host, bring your own models, connect custom tools, and tailor everything to your workflow
- **Lookouts** — Schedule recurring research agents that monitor topics, track changes, and email you updates

### Sources & Special Modes

Zetora no longer asks you to pick a search mode before every message. All former modes (Web, X, Academic, Reddit, GitHub, Stocks, Crypto, Prediction, YouTube, Spotify, Code, Extreme, Chat, …) are now **always-on sources** you can toggle per session or hide globally in Customize — the agent (or the **Auto** strategy) picks the right ones for each question.

A few modes remain **exclusive per-message selections**, because they replace the whole toolset for that turn:

| Special mode    | Description                                                                            |
| --------------- | -------------------------------------------------------------------------------------- |
| **Memory**      | Your personal memory companion: an editable profile plus facts learned from your chats |
| **Apps (MCP)**  | Use tools from your connected MCP apps                                                 |
| **Canvas**      | Research and generate interactive dashboards and visual reports                        |

**Voice** (real-time conversational AI, with a fully local speech-to-speech backend) lives on its own dedicated page.

### Skills (15 skills)

Loadable per-message via the `skill` tool (subject to your disabled-skills preference):

- **Research** — Deep Research (multi-part questions), Extreme Search (exhaustive single-topic fan-out), Academic Review, Social Pulse, Market Intel, Media Scout, Local Guide, Web Extract
- **Writing** — Deslop (humanize/paraphrase AI-generated text)
- **Generation** — Image Generation, Image Editing, Word Document (.docx), PowerPoint (.pptx), PDF, Excel (.xlsx)

### Tools (30+ tools)

#### Search & Retrieval

- **Web search** — Multi-query parallel web search with deduplication using Exa, Firecrawl, Parallel, and Tavily (or self-hosted SearXNG/fastCRW)
- **Extreme search** — LLM-driven deep research agent with multi-step planning, code execution, and artifact storage
- **Academic search** — Search academic papers and research using Exa and Firecrawl
- **Reddit search** — Search Reddit with configurable time ranges using Parallel
- **X search** — Search X posts with date range filtering and handle inclusion/exclusion using xAI Grok
- **YouTube search** — Search videos, channels, playlists with transcript extraction using Supadata
- **GitHub search** — Search repositories with structured metadata extraction using Firecrawl
- **Spotify search** — Search tracks, artists, albums, and playlists via Spotify Web API
- **URL content retrieval** — Extract content from any URL including tweets, YouTube, TikTok, and Instagram

#### Financial & Market Data

- **Stock charts** — Interactive stock charts with OHLC data, earnings, and news using Valyu, Tavily, and Exa
- **Currency converter** — Forex and crypto conversion with real-time rates using Valyu
- **Crypto tools** — Cryptocurrency data, contract lookups, and OHLC charts using CoinGecko
- **Prediction markets** — Query Polymarket and Kalshi data with Cohere reranking using Valyu

#### Location & Travel

- **Weather** — Current weather, 5-day forecast, air quality, and 16-day extended forecast using OpenWeatherMap and Open-Meteo
- **Maps & geocoding** — Forward/reverse geocoding and nearby place discovery using Google Maps API
- **Flight tracking** — Real-time flight status with departure/arrival details

#### Media & Entertainment

- **Movie/TV search** — Search movies and TV shows with detailed cast, ratings, and metadata using TMDB
- **Trending movies** — Today's trending movies from TMDB
- **Trending TV shows** — Today's trending TV shows from TMDB

#### Generation

- **Image generation & editing** — Generate images from text and edit existing ones (inpainting, object add/remove), with custom prompts, seed control, and durable storage
- **Document generation** — Produce downloadable .docx, .pptx, .pdf, and .xlsx files via the document skills and the code sandbox

#### Productivity & Utilities

- **Skill loader** — Loads the right research/generation skill for the current message (powers the Auto strategy)
- **Code interpreter** — Write and execute Python code in a sandboxed environment (self-hosted Docker sandbox or Daytona) with chart generation
- **Code context** — Get contextual information about programming topics using Exa Context API
- **Text translation** — Translate text (and text within images) between languages using AI models
- **File query search** — Semantic search over uploaded files (PDF, CSV, DOCX, Excel) with Cohere embeddings and reranking
- **Memory** — An editable profile plus facts learned automatically after each answer (stored in Postgres, no extra service), injected into the prompt when relevant; manage everything under Settings → Memories
- **Date & time** — Current date/time in multiple formats with timezone support
- **Greeting** — Personalized time-of-day-aware greetings

## LLM Models Supported

Zetora names no models itself. It lists the providers it integrates, and the models come from [models.dev](https://models.dev), an open catalog that Zetora re-reads every hour: new releases appear on their own, retired ones disappear, and capabilities (vision, PDF input, reasoning controls, context window) come from the same source. Only providers whose API key is set are listed.

- **Direct APIs** — OpenAI, Anthropic, Google AI Studio, Google Agent Platform, xAI, DeepSeek, Mistral, Cohere, Zhipu AI, Minimax and Sarvam
- **Aggregators** — Vercel AI Gateway, OpenRouter, Groq and Novita. They also serve MoonShot, Alibaba (Qwen), ByteDance, Arcee, Amazon, Xiaomi, StepFun, Inception and NVIDIA models, and act as automatic fallbacks for the direct APIs above
- **Auto** — Zetora's router picks a model per message based on the task
- **Custom providers** — Add any OpenAI-compatible endpoint (e.g. Ollama, local inference servers), including models that return tool calls as XML

Adding a lab is a single entry in [`ai/catalog/config.ts`](ai/catalog/config.ts). One `ZETORA_MODEL_*` variable per function (chat, titles, follow-up questions, Extreme Search…) sets the model everyone gets by default (see `.env.example`); each user can pick another one in Settings. There is no fallback: a function with neither does not run, and Settings shows it in red.

## Self-Hosted Stack

Zetora bundles a complete self-hosted stack in [`docker-compose.yml`](docker-compose.yml), so Zetora can run with little to no dependency on third-party cloud services beyond your chosen AI provider API keys.

| Service                | Container(s)                              | Profile    | Cloud equivalent                 | Purpose                                                                                                                 |
| ---------------------- | ----------------------------------------- | ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL 17**      | `postgres`                                | _(core)_   | Vercel Postgres / Neon           | Primary application database                                                                                            |
| **Redis 7**            | `redis`                                   | _(core)_   | Upstash Redis                    | Sessions, cache, rate limiting                                                                                          |
| **Silo**               | `minio`, `minio-create-bucket`            | `minio`    | Cloudflare R2 / AWS S3           | S3-compatible object storage for uploads, a maintained MinIO fork (point `S3_*` at it)                                  |
| **Qdrant**             | `qdrant`                                  | `qdrant`   | —                                | Vector store for the hybrid RAG pipeline (content indexing, RRF fusion, reranking)                                      |
| **SearXNG**            | `searxng`, `searxng-redis`                | `searxng`  | Tavily / Exa                     | Self-hosted metasearch engine for the Web search source                                                                 |
| **fastCRW**            | `fastcrw`, `chrome`                       | `fastcrw`  | Firecrawl                        | Self-hosted scraper & search (Firecrawl-compatible API) with JS rendering via LightPanda and a headless-Chrome fallback |
| **Code Interpreter**   | `sandbox`                                 | `sandbox`  | Daytona                          | Sandboxed Python execution for the Code Interpreter tool (`SANDBOX_PROVIDER=docker`)                                    |
| **Presidio**           | `presidio-api`                            | `presidio` | —                                | PII detection/anonymization for the activatable privacy layer                                                           |
| **Voice pipeline**     | `s2s-service`, `stt-service`, `qwen3-tts` | `voice`\*  | ElevenLabs / xAI Realtime        | Local speech-to-speech backend: VAD orchestrator, NVIDIA Parakeet TDT STT, and Qwen3 TTS (`tts` profile)                |
| **BullMQ**             | `bullmq-redis`, `bullboard`               | `bullmq`   | Upstash QStash                   | Self-hosted scheduler for Lookouts (`LOOKOUT_SCHEDULER=bullmq`), with a Bull Board admin UI                             |
| **Hermes Agent relay** | `hermes-relay-service`                    | `hermes`†  | —                                | Lets any user connect their own self-hosted Hermes Agent gateway as an Agent mode chat channel                          |
| **DB migrations**      | `db-migrate`                              | _(core)_   | _(manual `drizzle-kit migrate`)_ | Runs Drizzle migrations + performance indexes automatically; `zetora.app` waits for it before starting                  |

\* `s2s-service` and `stt-service` are behind the `voice` profile, `qwen3-tts` behind its own `tts` profile. `stt-service` and `qwen3-tts` need an NVIDIA GPU (Docker `nvidia` runtime).

† Unlike every other row, Hermes doesn't degrade to a cloud equivalent when its profile is left off — the whole feature (Settings > Hermes, the Agent mode entry, every `/api/hermes*`/`/api/internal/hermes*` route) is gated by the `NEXT_PUBLIC_HERMES_ENABLED` build flag. Hermes is experimental: `.env.example` sets the flag to `false`, so the feature is absent from the image; set it to `true` and add the `hermes` profile to opt in. The build flag controls whether the _feature exists in the image at all_, the profile whether _this deployment's container starts_.

Every profiled service is off by default — `docker compose up -d` alone starts only the `_(core)_` rows plus `zetora.app`. Storage (`S3_*`), code execution (`SANDBOX_PROVIDER`) and Lookout scheduling (`LOOKOUT_SCHEDULER`) have no default: set each in `.env` to a bundled service or its cloud alternative, or that feature reports what is missing.

### Choose a setup

Pick one row, set `COMPOSE_PROFILES` in `.env` to its value, then point the matching variables at what runs (`.env.example` documents each one). Every service also keeps its own profile, so any other mix works too.

| Setup              | `COMPOSE_PROFILES`     | What runs                                                                                      |
| ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Minimal**        | _(unset)_              | Postgres, Redis, the app. Cloud APIs for storage, search, code execution, scheduling and voice |
| **Self-hosted**    | `selfhosted`           | Adds every CPU-only service: Silo, SearXNG, fastCRW, sandbox, BullMQ, Qdrant, Presidio         |
| + **local voice**  | `selfhosted,voice,tts` | Adds local speech-to-speech and Qwen3 TTS (NVIDIA GPU)                                         |
| + **Hermes Agent** | add `hermes`           | Experimental; also set `NEXT_PUBLIC_HERMES_ENABLED=true` and rebuild                           |

Zetora only offers what the instance has. A search provider shows up in Settings and in the chat's sources once its API key or URL is set; Hybrid Search once `QDRANT_URL` is; Data protection once `ANONYMIZER_API_URL` is; the local voice backend once `VOICE_S2S_URL` is. With the bundled containers, these URLs are the Docker service names given in `.env.example`. Each search function picks the user's choice when the instance has it, else the first available provider in a fixed order: the self-hosted services, then Exa, Firecrawl and Parallel. A function with no provider at all is not offered, and Settings says what it needs. Fallback providers are off unless the user turns them on.

All services share the `zetora-network` Docker network and resolve each other by service name. Most services are bound to `127.0.0.1`; only `zetora.app` (port 3333), Silo's API port, and `s2s-service` publish beyond loopback (for reverse-proxy and browser access).

Beyond the bundled infrastructure, Zetora also adds:

- **Custom AI providers** with XML tool-call parsing, for OpenAI-compatible / local models (e.g. Ollama)
- **Automated database migrations** — the `db-migrate` container applies Drizzle migrations on every `docker compose up`, no manual step
- **Activatable PII anonymization** — Presidio-backed masking of personal data before requests leave for cloud providers
- **Local voice pipeline** — self-hosted speech-to-speech (VAD + Parakeet STT + Qwen3 TTS) as an alternative to cloud realtime voice, plus Read Aloud with streaming TTS
- **Hardened auth** — email verification, two-factor authentication, and an `ALLOW_SIGNUPS` switch to close the instance
- **Per-service diagnostics panel** in Settings to check the health of every bundled service
- **SMTP email delivery** for every email (any SMTP server, hosted relays included), with a built-in email test button
- **Sidebar visibility toggles** for Lookouts, Voice, and sources
- **User-configurable default model** and per-task tertiary model preferences
- **Embedding provider configuration**, including OpenAI-compatible endpoints, for the hybrid RAG pipeline
- **Pull-only compose file** — `docker-compose.yml` never builds; `docker-compose.build.yml` builds every custom image from the source tree, or `ZETORA_*_IMAGE` points the stack at images you publish to your own registry

## All-Cloud Configuration

If you'd rather not run the bundled services, Zetora can run entirely against managed/cloud providers. Don't start the corresponding compose services and set the matching environment variables instead:

| Self-hosted service | Cloud alternative                 | Configuration                                                                                                                                   |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres            | Vercel Postgres / Neon / Supabase | `DATABASE_URL` (+ optional `READ_DB_1`/`READ_DB_2` read replicas)                                                                               |
| Redis               | Upstash Redis                     | `REDIS_URL`                                                                                                                                     |
| Silo                | Cloudflare R2 / AWS S3            | `S3_ENDPOINT`, keys, bucket, `S3_PUBLIC_URL` and `S3_REGION` of the service (examples in `.env.example`)                                        |
| Qdrant              | — (disabled)                      | leave `QDRANT_URL` unset: Settings then hides Hybrid Search                                                                                     |
| SearXNG             | Exa / Firecrawl / Parallel        | the provider's API key (`EXA_API_KEY`, …); only providers whose key or URL is set are offered                                                   |
| fastCRW             | Firecrawl                         | `FIRECRAWL_API_KEY`; only providers whose key or URL is set are offered                                                                         |
| Sandbox             | Daytona                           | `SANDBOX_PROVIDER=daytona` with `DAYTONA_API_KEY`                                                                                               |
| Presidio            | — (disabled)                      | leave `ANONYMIZER_API_URL` unset: Settings then hides Data protection                                                                           |
| Voice pipeline      | ElevenLabs / xAI Realtime         | leave `VOICE_S2S_URL` unset: Settings then only offers the cloud backend                                                                        |
| BullMQ              | Upstash QStash                    | `LOOKOUT_SCHEDULER=qstash` with `QSTASH_TOKEN` (the only option on hosts with no long-running process, such as Vercel)                        |

See `.env.example` for the full catalog of provider and feature environment variables.

## Built with

- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Vercel AI SDK](https://sdk.vercel.ai/docs) - AI model integration and streaming
- [Shadcn/UI](https://ui.shadcn.com/) - UI components
- [Better Auth](https://github.com/better-auth/better-auth) - Authentication
- [Drizzle ORM](https://orm.drizzle.team/) - Database management
- [PostgreSQL](https://www.postgresql.org/) - Primary database
- [Silo](https://github.com/pgsty/silo) - Self-hosted S3-compatible object storage, a maintained fork of MinIO
- [Qdrant](https://qdrant.tech/) - Vector store for hybrid RAG
- [SearXNG](https://docs.searxng.org/) - Self-hosted metasearch engine
- fastCRW - Self-hosted web scraping and search (Firecrawl-compatible)
- [Microsoft Presidio](https://microsoft.github.io/presidio/) - PII detection for the anonymization layer
- [NVIDIA Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) + Qwen3 TTS - Self-hosted speech-to-text and text-to-speech
- [BullMQ](https://bullmq.io/) + [Bull Board](https://github.com/felixmosh/bull-board) - Self-hosted job scheduling for Lookouts
- [Exa.AI](https://exa.ai/) - Web search, academic search, and content retrieval
- [Firecrawl](https://firecrawl.dev/) - Web scraping with structured extraction
- [Parallel](https://parallel.ai/) - Web and Reddit search
- [Tavily](https://tavily.com/) - Web search and financial news
- [Valyu](https://valyu.network/) - Financial data, forex, and prediction markets
- [Supadata](https://supadata.ai/) - YouTube search, transcripts, and social media
- [CoinGecko](https://www.coingecko.com/) - Cryptocurrency market data
- [Spotify](https://developer.spotify.com/) - Music search
- [OpenWeatherMap](https://openweathermap.org/) - Weather data
- [Open-Meteo](https://open-meteo.com/) - Extended forecasts and geocoding
- [Daytona](https://daytona.io/) - Cloud code execution sandbox (alternative to the self-hosted sandbox)
- [Google Maps](https://developers.google.com/maps) - Geocoding and places
- [TMDB](https://www.themoviedb.org/) - Movie and TV data
- [Cohere](https://cohere.com/) - Embeddings and reranking
- [ElevenLabs](https://elevenlabs.io/) - Voice synthesis

## Installation

### Prerequisites

- Node.js 22+ and [pnpm](https://pnpm.io/) (enable via `corepack enable pnpm`)
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2 (for the self-hosted stack)
- At least one AI provider API key (OpenAI, Anthropic, xAI, Google, Groq, …)
- A domain name and a reverse proxy (Caddy, Nginx, Traefik, …) with TLS, if exposing the self-hosted stack publicly

### Option 1 — Local development (`pnpm dev`)

Use this for day-to-day development. It runs the Next.js app directly on your machine.

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/kcangiolu/zetora.git
   cd zetora
   corepack enable pnpm
   pnpm install
   ```
2. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
3. Fill in `.env.local`. At minimum:
   - `DATABASE_URL` — a Postgres connection string. You can use the self-hosted Postgres for this: start it alone with `docker compose up -d postgres` (reads `.env`) and connect to `postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/zetora`.
   - `BETTER_AUTH_SECRET` — generate with `openssl rand -base64 32`.
   - At least one AI provider key (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`).
4. Apply database migrations (reads `DATABASE_URL` from `.env.local` via `drizzle.config.ts`):
   ```bash
   pnpm drizzle-kit migrate
   ```
5. Start the dev server:
   ```bash
   pnpm dev
   ```
6. Open `http://localhost:3000`.

You can optionally bring up any other bundled service on its own (Redis, Silo, Qdrant, SearXNG, fastCRW, sandbox, Presidio, the voice services) with `docker compose up -d <service>` and point the matching `.env.local` variables at `localhost:<port>`. Presidio and the voice services are built from source: add `-f docker-compose.yml -f docker-compose.build.yml` and `--build` (see Option 2).

### Option 2 — Self-hosted stack (Docker Compose)

Use this to deploy Zetora on a server. By default it runs against cloud providers (Postgres/Redis still required, everything else optional) — opt into any self-hosted service with `--profile`.

1. Clone the repository on the server:
   ```bash
   git clone https://github.com/kcangiolu/zetora.git
   cd zetora
   ```
2. Create `.env` (gitignored — never commit it). Fill in at least:
   - **Domain**: `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_BASE_URL`, `ALLOWED_ORIGINS` — set to your public URL (e.g. `https://zetora.example.com`).
   - **Core secrets**: `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), `POSTGRES_PASSWORD`.
   - **Silo** (`minio` profile): `MINIO_ROOT_PASSWORD` (and optionally `MINIO_ROOT_USER`, `S3_PUBLIC_URL`).
   - **AI providers**: at least one provider API key.
   - Optional but recommended: `BULLMQ_REDIS_PASSWORD`, OAuth provider credentials.

   See `.env.example` for the full list of available variables.

3. Start the stack:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
   ```

   `docker-compose.yml` itself is pull-only: its custom images (`zetora-app`, `zetora-migrate`, `presidio-api`, `zetora-tts`, …) resolve to `ZETORA_*_IMAGE` variables, defaulting to `:local` tags that no registry serves. `docker-compose.build.yml` builds those `:local` images from the source tree. Set `COMPOSE_FILE=docker-compose.yml:docker-compose.build.yml` in `.env` to drop the `-f` flags. `zetora-app` has to be built per instance anyway: its `NEXT_PUBLIC_*` values (`NEXT_PUBLIC_APP_URL` first) are inlined into the client bundle at build time, so they're read from your `.env` and changing one needs `--build` again, not just a restart. If you publish your own images to a registry, set the `ZETORA_*_IMAGE` variables to their tags and use `docker compose pull && docker compose up -d` instead.

   Database migrations run automatically: the `db-migrate` container applies Drizzle migrations and performance indexes, and `zetora.app` waits for it to complete before starting — no manual `drizzle-kit migrate` needed.

   Every service below the core three (Postgres, Redis, `zetora.app`) starts only if you opt into its profile — see [Choose a setup](#choose-a-setup). Leaving one off means using its cloud equivalent instead (see [All-Cloud Configuration](#all-cloud-configuration)); `hermes` is the exception, it just disappears (see the † note above the table). Full self-hosted stack, voice included:

   ```bash
   COMPOSE_PROFILES=selfhosted,voice,tts docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
   ```

4. Put a reverse proxy with TLS in front of `zetora.app` (port 3333) for your domain. If you enabled the `minio` profile, also put one in front of Silo's API port (`:9010`) and point `S3_PUBLIC_URL` at it — generated images/files are served straight from that URL to the browser, no app-side proxy. For the local voice backend, expose `s2s-service`'s WebSocket port and point `VOICE_S2S_URL` at it. Every other service is bound to `127.0.0.1` only — use an SSH tunnel if you need direct access to an admin UI (Silo console on `:9001`, Bull Board on `:3001`, Qdrant dashboard on `:6333`, SearXNG on `:8090`).
5. Visit your domain — Zetora should be up and running. The Diagnostics tab in Settings shows the health of each bundled service.

All ten optional profiles (`minio`, `searxng`, `fastcrw`, `sandbox`, `bullmq`, `qdrant`, `presidio`, `voice`, `tts`, `hermes`) are off by default, nothing to edit to skip them. See [All-Cloud Configuration](#all-cloud-configuration) for exactly what each one falls back to when left off.

# Contributing and security

Bug reports and feature ideas are welcome as issues; code contributions are not accepted yet, see [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md).

# License

This project is licensed under the AGPLv3 License - see the [LICENSE](LICENSE) file for details.
