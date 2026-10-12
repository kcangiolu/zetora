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

The model list isn't hardcoded: Zetora builds it from [models.dev](https://models.dev), refreshed daily, and lists every current model the API keys you configured can reach — new releases show up by themselves, retired ones disappear. Capabilities (vision, PDF input, reasoning controls, context window) come from the same source.

- **Labs**: OpenAI, Anthropic, Google (AI Studio and Agent Platform), xAI, DeepSeek, Mistral, Cohere, Zhipu, MoonShot, Alibaba (Qwen), Minimax, ByteDance, Arcee, Amazon, Xiaomi, StepFun, Sarvam, Inception and NVIDIA — through each lab's own API, or through the Vercel AI Gateway, OpenRouter, Groq or Novita, which also serve as automatic fallbacks
- **Auto** — Zetora's router picks a model per message based on the task
- **Custom providers** — Add any OpenAI-compatible endpoint (e.g. Ollama, local inference servers), including models that return tool calls as XML

Adding a lab is a single entry in [`ai/catalog/config.ts`](ai/catalog/config.ts). One `ZETORA_MODEL_*` variable per function (chat, titles, follow-up questions, Extreme Search…) sets the model everyone gets by default (see `.env.example`); each user can pick another one in Settings. There is no fallback: a function with neither does not run, and Settings shows it in red.

## Self-Hosted Stack

This fork bundles a complete self-hosted stack in [`docker-compose.yml`](docker-compose.yml), so Zetora can run with little to no dependency on third-party cloud services beyond your chosen AI provider API keys.

| Service                | Container(s)                              | Profile    | Cloud equivalent (Scira default) | Purpose                                                                                                                 |
| ---------------------- | ----------------------------------------- | ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL 17**      | `postgres`                                | _(core)_   | Vercel Postgres / Neon           | Primary application database                                                                                            |
| **Redis 7**            | `redis`                                   | _(core)_   | Upstash Redis                    | Sessions, cache, rate limiting                                                                                          |
| **MinIO**              | `minio`, `minio-create-bucket`            | `minio`    | Cloudflare R2 / Vercel Blob      | S3-compatible object storage for uploads (`STORAGE_PROVIDER=minio`)                                                     |
| **Qdrant**             | `qdrant`                                  | `qdrant`   | _(new — no Scira equivalent)_    | Vector store for the hybrid RAG pipeline (content indexing, RRF fusion, reranking)                                      |
| **SearXNG**            | `searxng`, `searxng-redis`                | `searxng`  | Tavily / Exa                     | Self-hosted metasearch engine for the Web search source                                                                 |
| **fastCRW**            | `fastcrw`, `chrome`                       | `fastcrw`  | Firecrawl                        | Self-hosted scraper & search (Firecrawl-compatible API) with JS rendering via LightPanda and a headless-Chrome fallback |
| **Code Interpreter**   | `sandbox`                                 | `sandbox`  | Daytona                          | Sandboxed Python execution for the Code Interpreter tool (`SANDBOX_PROVIDER=docker`)                                    |
| **Presidio**           | `presidio-api`                            | `presidio` | _(new — no Scira equivalent)_    | PII detection/anonymization for the activatable privacy layer                                                           |
| **Voice pipeline**     | `s2s-service`, `stt-service`, `qwen3-tts` | `tts`\*    | ElevenLabs / xAI Realtime        | Local speech-to-speech backend: VAD orchestrator, NVIDIA Parakeet TDT STT, and opt-in GPU Qwen3 TTS (`--profile tts`)   |
| **BullMQ**             | `bullmq-redis`, `bullboard`               | `bullmq`   | Upstash QStash                   | Self-hosted scheduler for Lookouts (recurring research agents), with a Bull Board admin UI                              |
| **Hermes Agent relay** | `hermes-relay-service`                    | `hermes`†  | _(new — no Scira equivalent)_    | Lets any user connect their own self-hosted Hermes Agent gateway as an Agent mode chat channel                          |
| **DB migrations**      | `db-migrate`                              | _(core)_   | _(manual `drizzle-kit migrate`)_ | Runs Drizzle migrations + performance indexes automatically; `zetora.app` waits for it before starting                  |

\* Only `qwen3-tts` is behind the `tts` profile — `s2s-service`/`stt-service` (CPU-only) start by default alongside the core services below.

† Unlike every other row, Hermes doesn't degrade to a cloud equivalent when its profile is left off — the whole feature (Settings > Hermes, the Agent mode entry, every `/api/hermes*`/`/api/internal/hermes*` route) is gated by the `NEXT_PUBLIC_HERMES_ENABLED` build flag, which defaults to `true` since it already ships to real users on this fork. The Docker profile itself still needs explicit opt-in like any other (`--profile hermes` / `COMPOSE_PROFILES=hermes`) — the build flag only controls whether the _feature exists in the image at all_, not whether _this deployment's container starts_. Set `NEXT_PUBLIC_HERMES_ENABLED=false` to build an image with the feature hidden entirely.

Every profiled service is off by default — `docker compose up -d` alone starts only the `_(core)_` rows plus `zetora.app`, running entirely against cloud providers out of the box. Start any subset with `docker compose --profile <name> up -d` (see [Self-hosted stack](#option-2--self-hosted-stack-docker-compose) below for the full command and what each one falls back to when left off).

All services share the `zetora-network` Docker network and resolve each other by service name. Most services are bound to `127.0.0.1`; only `zetora.app` (port 3333), MinIO's API port, and `s2s-service` publish beyond loopback (for reverse-proxy and browser access).

Beyond the bundled infrastructure, this fork also adds:

- **Custom AI providers** with XML tool-call parsing, for OpenAI-compatible / local models (e.g. Ollama)
- **Automated database migrations** — the `db-migrate` container applies Drizzle migrations on every `docker compose up`, no manual step
- **Activatable PII anonymization** — Presidio-backed masking of personal data before requests leave for cloud providers
- **Local voice pipeline** — self-hosted speech-to-speech (VAD + Parakeet STT + Qwen3 TTS) as an alternative to cloud realtime voice, plus Read Aloud with streaming TTS
- **Hardened auth** — email verification, two-factor authentication, and an `ALLOW_SIGNUPS` switch to close the instance
- **Per-service diagnostics panel** in Settings to check the health of every bundled service
- **SMTP email delivery** as an alternative to Resend, with a built-in email test button
- **Sidebar visibility toggles** for Lookouts, Voice, and sources
- **User-configurable default model** and per-task tertiary model preferences
- **Embedding provider configuration**, including OpenAI-compatible endpoints, for the hybrid RAG pipeline
- **CI-built images** — all custom images are built and published by Gitea Actions (`.gitea/workflows/docker.yml`); the compose file only pulls

## All-Cloud Configuration

If you'd rather not run the bundled services, Zetora can run entirely against managed/cloud providers, closer to the original Scira setup. Don't start the corresponding compose services and set the matching environment variables instead:

| Self-hosted service | Cloud alternative                 | Configuration                                                                                                                                   |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres            | Vercel Postgres / Neon / Supabase | `DATABASE_URL` (+ optional `READ_DB_1`/`READ_DB_2` read replicas)                                                                               |
| Redis               | Upstash Redis                     | `REDIS_URL`                                                                                                                                     |
| MinIO               | Cloudflare R2 / Vercel Blob       | `STORAGE_PROVIDER=cloudflare-r2` (default) with R2 credentials — also live in Settings as a per-user "Storage provider" toggle                  |
| Qdrant              | — (disabled)                      | leave `QDRANT_URL` unset to disable the vector cache                                                                                            |
| SearXNG             | Tavily / Exa                      | `TAVILY_API_KEY`, `EXA_API_KEY` (used automatically when `SEARXNG_URL` is unset)                                                                |
| fastCRW             | Firecrawl                         | `FIRECRAWL_API_KEY` (used automatically when `FASTCRW_URL` is unset)                                                                            |
| Sandbox             | Daytona                           | `SANDBOX_PROVIDER=daytona` (default) with `DAYTONA_API_KEY`                                                                                     |
| Presidio            | — (disabled)                      | leave `ANONYMIZER_API_URL` unset — the anonymization layer stays off                                                                            |
| Voice pipeline      | ElevenLabs / xAI Realtime         | leave `VOICE_S2S_URL` unset; configure TTS/STT providers in Settings                                                                            |
| BullMQ              | Upstash QStash                    | `QSTASH_TOKEN` and related QStash variables — also live in Settings as a per-user "Lockout scheduling provider" toggle, not just an env default |

See `.env.example` for the full catalog of provider and feature environment variables.

## Built with

- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Vercel AI SDK](https://sdk.vercel.ai/docs) - AI model integration and streaming
- [Shadcn/UI](https://ui.shadcn.com/) - UI components
- [Better Auth](https://github.com/better-auth/better-auth) - Authentication
- [Drizzle ORM](https://orm.drizzle.team/) - Database management
- [PostgreSQL](https://www.postgresql.org/) - Primary database
- [MinIO](https://min.io/) - Self-hosted S3-compatible object storage
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
   git clone <your-repo-url> zetora
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

You can optionally bring up any other bundled service on its own (Redis, MinIO, Qdrant, SearXNG, fastCRW, sandbox, Presidio, the voice services) with `docker compose up -d <service>` and point the matching `.env.local` variables at `localhost:<port>`.

### Option 2 — Self-hosted stack (Docker Compose)

Use this to deploy Zetora on a server. By default it runs against cloud providers (Postgres/Redis still required, everything else optional) — opt into any self-hosted service with `--profile`.

1. Clone the repository on the server:
   ```bash
   git clone <your-repo-url> zetora
   cd zetora
   ```
2. Create `.env` (gitignored — never commit it). Fill in at least:
   - **Domain**: `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_BASE_URL`, `ALLOWED_ORIGINS` — set to your public URL (e.g. `https://zetora.example.com`).
   - **Core secrets**: `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), `POSTGRES_PASSWORD`.
   - **MinIO**: `MINIO_ROOT_PASSWORD` (and optionally `MINIO_ROOT_USER`, `S3_PUBLIC_URL`).
   - **AI providers**: at least one provider API key.
   - Optional but recommended: `BULLMQ_REDIS_PASSWORD`, OAuth provider credentials.

   See `.env.example` for the full list of available variables.

3. Start the stack:

   ```bash
   docker compose up -d
   ```

   The compose file has no `build:` sections on purpose — all custom images (`zetora-app`, `zetora-migrate`, `presidio-api`, `zetora-tts`, …) are built and published to the registry by the Gitea Actions workflow (`.gitea/workflows/docker.yml`). If you're running your own fork, point the `image:` references at your own registry (or add `build:` sections back locally).

   Database migrations run automatically: the `db-migrate` container applies Drizzle migrations and performance indexes, and `zetora.app` waits for it to complete before starting — no manual `drizzle-kit migrate` needed.

   Every service below the core three (Postgres, Redis, `zetora.app`) starts on the `zetora-network` only if you opt into its profile — combine as needed, e.g. `docker compose --profile minio --profile searxng up -d`, or set `COMPOSE_PROFILES` to a comma-separated list in `.env`. Each one has a working cloud default already, so leaving it off degrades the corresponding feature to its cloud equivalent instead of breaking it — see the **Profile** column in the [Self-Hosted Stack](#self-hosted-stack) table above and [All-Cloud Configuration](#all-cloud-configuration) for exactly what each one falls back to. `hermes` is the one exception: it doesn't fall back to anything, it just disappears (see the † note above the table). Full self-hosted stack:

   ```bash
   docker compose --profile minio --profile searxng --profile fastcrw \
     --profile sandbox --profile bullmq --profile qdrant \
     --profile presidio --profile tts --profile hermes up -d
   ```

4. Put a reverse proxy with TLS in front of `zetora.app` (port 3333) for your domain. If you enabled the `minio` profile, also put one in front of MinIO's API port (`:9010`) and point `S3_PUBLIC_URL` at it — generated images/files are served straight from that URL to the browser, no app-side proxy. For the local voice backend, expose `s2s-service`'s WebSocket port and point `VOICE_S2S_URL` at it. Every other service is bound to `127.0.0.1` only — use an SSH tunnel if you need direct access to an admin UI (MinIO console on `:9001`, Bull Board on `:3001`, Qdrant dashboard on `:6333`, SearXNG on `:8090`).
5. Visit your domain — Zetora should be up and running. The Diagnostics tab in Settings shows the health of each bundled service.

All eight optional services (`minio`, `searxng`, `fastcrw`, `sandbox`, `bullmq`, `qdrant`, `presidio`, `tts`) are behind their own profile — none started by default, nothing to edit to skip them. See [All-Cloud Configuration](#all-cloud-configuration) for exactly what each one falls back to when left off.

# License

This project is licensed under the AGPLv3 License - see the [LICENSE](LICENSE) file for details.
