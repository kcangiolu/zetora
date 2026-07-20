# Zetora

A fork of [Scira](https://github.com/zaidmukaddam/scira) by Zaid Mukaddam, extended into an agentic research platform.

Research at the speed of thought. The agentic research platform that plans, retrieves, and cites — so you can think faster.

## How It Works

1. **Ask anything** — Type a question, upload a PDF, or paste a URL. Toggle sources and skills, or let Auto decide the strategy for you.
2. **Zetora plans & retrieves** — The agent breaks your question into sub-tasks, searches live sources, and cross-checks the evidence.
3. **Get cited answers** — Receive a grounded answer with inline citations. Click any source to verify it yourself.

## Features

### Core Capabilities

- **Agentic Planning** — Breaks complex questions into steps, selects the right models and tools, then executes multi-step workflows end to end
- **Grounded Retrieval** — Every answer comes with inline citations you can click to audit the evidence yourself
- **Hybrid RAG** — Self-hosted vector search (Qdrant) with content indexing, RRF fusion, and Cohere reranking for file/connector search
- **Skills** — 15 loadable research and generation skills (deep research, academic review, market intel, image generation, Office documents, …) picked automatically per message
- **Generation** — Image generation and editing with durable storage, plus document generation skills for .docx, .pptx, .pdf, and .xlsx
- **Privacy Layer** — Optional PII anonymization (Microsoft Presidio) that masks personal data before it reaches cloud providers
- **Extensible & Open** — AGPL-3.0 licensed. Self-host, bring your own models, connect custom tools, and tailor everything to your workflow
- **Lookouts** — Schedule recurring research agents that monitor topics, track changes, and email you updates

### Sources & Special Modes

Zetora no longer asks you to pick a search mode before every message. All former modes (Web, X, Academic, Reddit, GitHub, Stocks, Crypto, Prediction, YouTube, Spotify, Code, Extreme, Chat, …) are now **always-on sources** you can toggle per session or hide globally in Customize — the agent (or the **Auto** strategy) picks the right ones for each question.

A few modes remain **exclusive per-message selections**, because they replace the whole toolset for that turn:

| Special mode    | Description                                                                           |
| --------------- | ------------------------------------------------------------------------------------- |
| **Memory**      | Your personal memory companion, backed by a knowledge graph                           |
| **Connectors**  | Search Google Drive, Notion & OneDrive _(Pro)_                                        |
| **Apps (MCP)**  | Use tools from your connected MCP apps _(Pro)_                                        |
| **Multi-agent** | High-agency research via xAI's multi-agent Grok with server-side web/X search _(Pro)_ |
| **Canvas**      | Research and generate interactive dashboards and visual reports _(Pro)_               |

**Voice** (real-time conversational AI, with a fully local speech-to-speech backend) and **XQL** (advanced X query language for tweet analysis, _Pro_) live on their own dedicated pages.

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

- **Image generation & editing** — Generate images from text and edit existing ones (inpainting, object add/remove), with custom prompts, seed control, and durable storage _(Max)_
- **Document generation** — Produce downloadable .docx, .pptx, .pdf, and .xlsx files via the document skills and the code sandbox

#### Productivity & Utilities

- **Skill loader** — Loads the right research/generation skill for the current message (powers the Auto strategy)
- **Code interpreter** — Write and execute Python code in a sandboxed environment (self-hosted Docker sandbox or Daytona) with chart generation
- **Code context** — Get contextual information about programming topics using Exa Context API
- **Text translation** — Translate text (and text within images) between languages using AI models
- **File query search** — Semantic search over uploaded files (PDF, CSV, DOCX, Excel) with Cohere embeddings and reranking
- **Connectors search** — Search connected Google Drive, Notion, and OneDrive
- **Memory tools** — Save and search personal memories, backed by a self-hosted knowledge graph (Graphiti/FalkorDB) or Supermemory
- **Date & time** — Current date/time in multiple formats with timezone support
- **Greeting** — Personalized time-of-day-aware greetings

## LLM Models Supported

- **Auto** — Zetora's router picks a model per message based on the task
- **xAI**: Grok 3 (+Mini), Grok 4, Grok 4 Fast, Grok 4.1 Fast, Grok 4.20 Beta, Grok 4.20 Multi Agent Beta, Grok 4.5, Grok Code
- **OpenAI**: GPT 4.1 (Nano/Mini/Standard), GPT 5 through GPT 5.6 (Instant/Thinking/Codex variants, incl. 5.6 Sol/Terra/Luna), o3, o4 mini, GPT OSS 20B/120B
- **Anthropic**: Claude Haiku 4.5, Claude Sonnet 4.5/4.6/5, Claude Opus 4.5/4.6/4.7/4.8 (all with Thinking variants)
- **Google**: Gemini 2.5 (Flash Lite/Flash/Pro), Gemini 3 Flash, Gemini 3.1 (Flash Lite/Pro), Gemini 3.5 Flash
- **Alibaba (Qwen)**: Qwen 3 (4B/32B/235B/VL/Max/Coder/Next), Qwen 3.5 (Flash/27B/35B/122B/397B/Plus), Qwen 3.7 (Plus/Max)
- **Mistral**: Ministral 3 (3B/8B/14B), Mistral Large 3, Mistral Medium, Mistral Small 4, Magistral (Small/Medium), Devstral 2 (Small/Standard), Leanstral
- **DeepSeek**: v3, v3.1 Terminus, v3.2 (+Exp), V4 Flash, V4 Pro, R1, R1 0528
- **Zhipu (GLM)**: GLM 4.5, GLM 4.5 Air, GLM 4.6, GLM 4.6V (+Flash), GLM 4.7, GLM 5, GLM 5.2
- **Cohere**: Command A, Command A Thinking, Command A+
- **MoonShot**: Kimi K2 0905, K2 Thinking, K2.5, K2.6, K2.7 Code
- **Minimax**: M1 80K, M2, M2.1 (+Lightning), M2.5, M2.7, M3
- **ByteDance**: Seed 1.6 (+Flash), Seed 1.8, Seed 2.0 (Lite/Mini)
- **NVIDIA**: Nemotron 3 Super, Nemotron 3 Ultra
- **Arcee**: Trinity Mini, Trinity Large
- **Others**: Vercel v0 (1.0/1.5), Amazon Nova 2 Lite, Xiaomi Mimo V2 (Flash/Pro), StepFun Step 3.5 Flash, Kwaipilot KAT-Coder-Pro V1, Sarvam 105B, Inception Mercury 2
- **Custom providers** — Add any OpenAI-compatible endpoint (e.g. Ollama, local inference servers), including models that return tool calls as XML

## Self-Hosted Stack

This fork bundles a complete self-hosted stack in [`docker-compose.yml`](docker-compose.yml), so Zetora can run with little to no dependency on third-party cloud services beyond your chosen AI provider API keys.

| Service                 | Container(s)                               | Cloud equivalent (Scira default) | Purpose                                                                                                                 |
| ----------------------- | ------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL 17**       | `postgres`                                 | Vercel Postgres / Neon           | Primary application database                                                                                            |
| **Redis 7**             | `redis`                                    | Upstash Redis                    | Sessions, cache, rate limiting                                                                                          |
| **MinIO**               | `minio`, `minio-create-bucket`             | Cloudflare R2 / Vercel Blob      | S3-compatible object storage for uploads (`STORAGE_PROVIDER=minio`)                                                     |
| **Qdrant**              | `qdrant`                                   | _(new — no Scira equivalent)_    | Vector store for the hybrid RAG pipeline (content indexing, RRF fusion, reranking)                                      |
| **SearXNG**             | `searxng`, `searxng-redis`                 | Tavily / Exa                     | Self-hosted metasearch engine for the Web search source                                                                 |
| **fastCRW**             | `fastcrw`, `chrome`                        | Firecrawl                        | Self-hosted scraper & search (Firecrawl-compatible API) with JS rendering via LightPanda and a headless-Chrome fallback |
| **Code Interpreter**    | `sandbox`                                  | Daytona                          | Sandboxed Python execution for the Code Interpreter tool (`SANDBOX_PROVIDER=docker`)                                    |
| **FalkorDB + Graphiti** | `falkordb`, `graphiti-api`, `graphiti-mcp` | Supermemory / Mem0               | Self-hosted knowledge-graph memory provider                                                                             |
| **Presidio**            | `presidio-api`                             | _(new — no Scira equivalent)_    | PII detection/anonymization for the activatable privacy layer                                                           |
| **Voice pipeline**      | `s2s-service`, `stt-service`, `qwen3-tts`  | ElevenLabs / xAI Realtime        | Local speech-to-speech backend: VAD orchestrator, NVIDIA Parakeet TDT STT, and opt-in GPU Qwen3 TTS (`--profile tts`)   |
| **BullMQ**              | `bullmq-redis`, `bullboard`                | Upstash QStash                   | Self-hosted scheduler for Lookouts (recurring research agents), with a Bull Board admin UI                              |
| **DB migrations**       | `db-migrate`                               | _(manual `drizzle-kit migrate`)_ | Runs Drizzle migrations + performance indexes automatically; `zetora.app` waits for it before starting                  |

All services share the `zetora-network` Docker network and resolve each other by service name. Most services are bound to `127.0.0.1`; only `zetora.app` (port 3333), MinIO's API port, and `s2s-service` publish beyond loopback (for reverse-proxy and browser access).

Beyond the bundled infrastructure, this fork also adds:

- **Custom AI providers** with XML tool-call parsing, for OpenAI-compatible / local models (e.g. Ollama)
- **Automated database migrations** — the `db-migrate` container applies Drizzle migrations on every `docker compose up`, no manual step
- **Activatable PII anonymization** — Presidio-backed masking of personal data before requests leave for cloud providers
- **Local voice pipeline** — self-hosted speech-to-speech (VAD + Parakeet STT + Qwen3 TTS) as an alternative to cloud realtime voice, plus Read Aloud with streaming TTS
- **Hardened auth** — email verification, two-factor authentication, and an `ALLOW_SIGNUPS` switch to close the instance
- **Per-service diagnostics panel** in Settings to check the health of every bundled service
- **SMTP email delivery** as an alternative to Resend, with a built-in email test button
- **Sidebar visibility toggles** for Lookouts, XQL, Voice, and sources
- **User-configurable default model** and per-task tertiary model preferences
- **Embedding provider configuration**, including OpenAI-compatible endpoints, for the hybrid RAG pipeline
- **CI-built images** — all custom images are built and published by Gitea Actions (`.gitea/workflows/docker.yml`); the compose file only pulls

## All-Cloud Configuration

If you'd rather not run the bundled services, Zetora can run entirely against managed/cloud providers, closer to the original Scira setup. Don't start the corresponding compose services and set the matching environment variables instead:

| Self-hosted service | Cloud alternative                 | Configuration                                                                    |
| ------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| Postgres            | Vercel Postgres / Neon / Supabase | `DATABASE_URL` (+ optional `READ_DB_1`/`READ_DB_2` read replicas)                |
| Redis               | Upstash Redis                     | `REDIS_URL`                                                                      |
| MinIO               | Cloudflare R2 / Vercel Blob       | `STORAGE_PROVIDER=cloudflare-r2` (default) with R2 credentials                   |
| Qdrant              | — (disabled)                      | leave `QDRANT_URL` unset to disable the vector cache                             |
| SearXNG             | Tavily / Exa                      | `TAVILY_API_KEY`, `EXA_API_KEY` (used automatically when `SEARXNG_URL` is unset) |
| fastCRW             | Firecrawl                         | `FIRECRAWL_API_KEY` (used automatically when `FASTCRW_URL` is unset)             |
| Sandbox             | Daytona                           | `SANDBOX_PROVIDER=daytona` (default) with `DAYTONA_API_KEY`                      |
| FalkorDB + Graphiti | Supermemory                       | `SUPERMEMORY_API_KEY`                                                            |
| Presidio            | — (disabled)                      | leave `ANONYMIZER_API_URL` unset — the anonymization layer stays off             |
| Voice pipeline      | ElevenLabs / xAI Realtime         | leave `VOICE_S2S_URL` unset; configure TTS/STT providers in Settings             |
| BullMQ              | Upstash QStash                    | `QSTASH_TOKEN` and related QStash variables                                      |

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
- [FalkorDB](https://www.falkordb.com/) + [Graphiti](https://github.com/getzep/graphiti) - Self-hosted knowledge-graph memory
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
- [Supermemory](https://supermemory.ai/) - Cloud memory management and connector search (alternative to Graphiti)
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

You can optionally bring up any other bundled service on its own (Redis, MinIO, Qdrant, SearXNG, fastCRW, sandbox, Graphiti, Presidio, the voice services) with `docker compose up -d <service>` and point the matching `.env.local` variables at `localhost:<port>`.

### Option 2 — Self-hosted stack (Docker Compose)

Use this to deploy the full stack (app + Postgres, Redis, MinIO, Qdrant, SearXNG, sandbox, Graphiti/FalkorDB, BullMQ) on a server.

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
   - Optional but recommended: `BULLMQ_REDIS_PASSWORD`, Graphiti `GRAPHITI_LLM_*`/`GRAPHITI_EMBEDDING_*` keys, OAuth provider credentials, payment provider keys.

   See `.env.example` for the full list of available variables, and the comments at the top of `docker-compose.yml` for how to drop optional services.

3. Start the stack:

   ```bash
   docker compose up -d
   ```

   The compose file has no `build:` sections on purpose — all custom images (`zetora-app`, `zetora-migrate`, `graphiti-*`, `presidio-api`, `zetora-tts`, …) are built and published to the registry by the Gitea Actions workflow (`.gitea/workflows/docker.yml`). If you're running your own fork, point the `image:` references at your own registry (or add `build:` sections back locally).

   Database migrations run automatically: the `db-migrate` container applies Drizzle migrations and performance indexes, and `zetora.app` waits for it to complete before starting — no manual `drizzle-kit migrate` needed.

   Every bundled service starts on the `zetora-network`, except `qwen3-tts` (GPU text-to-speech), which is opt-in — it shares the GPU with local LLM inference, so it's off by default. Start it on demand with `docker compose --profile tts up -d qwen3-tts`, or set `COMPOSE_PROFILES=tts` in `.env` to keep it always resident.

4. Put a reverse proxy with TLS in front of `zetora.app` (port 3333) for your domain. Also put one in front of MinIO's API port (`:9010`) and point `S3_PUBLIC_URL` at it — generated images/files are served straight from that URL to the browser, no app-side proxy. For the local voice backend, expose `s2s-service`'s WebSocket port and point `VOICE_S2S_URL` at it. Every other service (Postgres, Redis, MinIO's console, Qdrant, SearXNG, fastCRW, sandbox, FalkorDB, Graphiti, Presidio, BullMQ) is bound to `127.0.0.1` only — use an SSH tunnel if you need direct access to an admin UI (MinIO console on `:9001`, Bull Board on `:3001`, Qdrant dashboard on `:6333`, SearXNG on `:8090`, FalkorDB browser on `:3002`).
5. Visit your domain — Zetora should be up and running. The Diagnostics tab in Settings shows the health of each bundled service.

To drop an optional service (MinIO, Qdrant, SearXNG, fastCRW, sandbox, Graphiti, Presidio, the voice services, BullMQ), remove its block from `docker-compose.yml` along with the matching environment variables on `zetora.app`; the app falls back to its cloud defaults as described in [All-Cloud Configuration](#all-cloud-configuration).

# License

This project is licensed under the AGPLv3 License - see the [LICENSE](LICENSE) file for details.
