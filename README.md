# Zetora

Research at the speed of thought. The agentic research platform that plans, retrieves, and cites — so you can think faster.

![Zetora](/app/opengraph-image.png)

## How It Works

1. **Ask anything** — Type a question, upload a PDF, or paste a URL. Pick a mode or let Zetora decide for you.
2. **Zetora plans & retrieves** — The agent breaks your question into sub-tasks, searches live sources, and cross-checks the evidence.
3. **Get cited answers** — Receive a grounded answer with inline citations. Click any source to verify it yourself.

## Features

### Core Capabilities

- **Agentic Planning** — Breaks complex questions into steps, selects the right models and tools, then executes multi-step workflows end to end
- **Grounded Retrieval** — Every answer comes with inline citations you can click to audit the evidence yourself
- **Hybrid RAG** — Self-hosted vector search (Qdrant) with content indexing, RRF fusion, and Cohere reranking for file/connector search
- **Extensible & Open** — AGPL-3.0 licensed. Self-host, bring your own models, connect custom tools, and tailor everything to your workflow
- **Lookouts** — Schedule recurring research agents that monitor topics, track changes, and email you updates

### Search Modes (17 modes)

| Mode | Description |
|---|---|
| **Web** | Search the entire web with AI-powered analysis |
| **Chat** | Talk to the model directly, no search |
| **X** | Real-time posts, trends, and conversations |
| **Stocks** | Market data, charts, and financial analysis |
| **Code** | Get context about languages and frameworks |
| **Academic** | Research papers, citations, and scholarly sources |
| **Extreme** | Deep research with multiple sources and analysis |
| **Reddit** | Discussions, opinions, and community insights |
| **GitHub** | Repositories, code, and developer discussions |
| **Crypto** | Cryptocurrency research powered by CoinGecko |
| **Prediction** | Prediction markets from Polymarket and Kalshi |
| **YouTube** | Video summaries, transcripts, and analysis |
| **Spotify** | Search songs, artists, and albums |
| **Connectors** | Search Google Drive, Notion & OneDrive *(Pro)* |
| **Memory** | Your personal memory companion *(Pro)* |
| **Voice** | Conversational AI with real-time voice *(Pro)* |
| **XQL** | Advanced X query language for tweet analysis *(Pro)* |

### Tools (28 tools)

#### Search & Retrieval
- **Web search** — Multi-query parallel web search with deduplication using Exa, Firecrawl, Parallel, and Tavily (or self-hosted SearXNG)
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

#### Productivity & Utilities
- **Code interpreter** — Write and execute Python code in a sandboxed environment (self-hosted Docker sandbox or Daytona) with chart generation
- **Code context** — Get contextual information about programming topics using Exa Context API
- **Text translation** — Translate text (and text within images) between languages using AI models
- **File query search** — Semantic search over uploaded files (PDF, CSV, DOCX, Excel) with Cohere embeddings and reranking
- **Connectors search** — Search connected Google Drive, Notion, and OneDrive
- **Memory tools** — Save and search personal memories, backed by a self-hosted knowledge graph (Graphiti/FalkorDB) or Supermemory
- **Date & time** — Current date/time in multiple formats with timezone support
- **Greeting** — Personalized time-of-day-aware greetings

## LLM Models Supported

- **xAI**: Grok 3, Grok 3 Mini, Grok 4, Grok 4 Fast, Grok 4.1 Fast, Grok Code
- **OpenAI**: GPT 4.1 (Nano/Mini/Standard), GPT 5 (Nano/Mini/Medium/Standard), GPT 5.1 (Instant/Thinking/Codex), GPT 5.2 (Instant/Thinking/Codex), o3, o4 mini, GPT OSS 20B/120B
- **Anthropic**: Claude Haiku 4.5, Claude Sonnet 4.5, Claude 4.5 Opus, Claude 4.6 Opus
- **Google**: Gemini 2.5 Flash (Lite/Standard), Gemini 2.5 Pro, Gemini 3 Flash, Gemini 3 Pro
- **Alibaba (Qwen)**: Qwen 3 (4B/32B/235B), Qwen 3 VL, Qwen 3 Max, Qwen 3 Coder (Small/Standard/Plus/Next), Qwen 3 Next 80B
- **Mistral**: Ministral 3 (3B/8B/14B), Mistral Large 3, Mistral Medium, Magistral (Small/Medium), Devstral 2 (Small/Standard)
- **DeepSeek**: DeepSeek v3, v3.1 Terminus, v3.2, R1, R1 0528
- **Zhipu (GLM)**: GLM 4.5, GLM 4.5 Air, GLM 4.6, GLM 4.6V, GLM 4.7, GLM 4.7 Flash
- **Cohere**: Command A, Command A Thinking
- **MoonShot**: Kimi K2, Kimi K2.5
- **Minimax**: M1 80K, M2, M2.1, M2.1 Lightning
- **ByteDance**: Seed 1.6, Seed 1.6 Flash, Seed 1.8
- **Arcee**: Trinity Mini, Trinity Large
- **Others**: Vercel v0 (1.0/1.5), Amazon Nova 2 Lite, Xiaomi Mimo V2 Flash, StepFun Step 3.5 Flash, Kwaipilot KAT-Coder-Pro V1
- **Custom providers** — Add any OpenAI-compatible endpoint (e.g. Ollama, local inference servers), including models that return tool calls as XML

## Self-Hosted Stack

This fork bundles a complete self-hosted stack in [`docker-compose.yml`](docker-compose.yml), so Zetora can run with little to no dependency on third-party cloud services beyond your chosen AI provider API keys.

| Service | Container(s) | Cloud equivalent (Scira default) | Purpose |
|---|---|---|---|
| **PostgreSQL 17** | `postgres` | Vercel Postgres / Neon | Primary application database |
| **Redis 7** | `redis` | Upstash Redis | Sessions, cache, rate limiting |
| **MinIO** | `minio`, `minio-create-bucket` | Cloudflare R2 / Vercel Blob | S3-compatible object storage for uploads (`STORAGE_PROVIDER=minio`) |
| **Qdrant** | `qdrant` | *(new — no Scira equivalent)* | Vector store for the hybrid RAG pipeline (content indexing, RRF fusion, reranking) |
| **SearXNG** | `searxng`, `searxng-redis` | Tavily / Exa | Self-hosted metasearch engine for the Web search mode |
| **Code Interpreter** | `sandbox` | Daytona | Sandboxed Python execution for the Code Interpreter tool (`SANDBOX_PROVIDER=docker`) |
| **FalkorDB + Graphiti** | `falkordb`, `graphiti-api`, `graphiti-mcp` | Supermemory / Mem0 | Self-hosted knowledge-graph memory provider |
| **BullMQ** | `bullmq-redis`, `bullboard` | Upstash QStash | Self-hosted scheduler for Lookouts (recurring research agents), with a Bull Board admin UI |

All services share the `zetora-network` Docker network and resolve each other by service name. Internal-only services are bound to `127.0.0.1` — only `zetora.app` (port 3000) needs to be exposed through a reverse proxy.

Beyond the bundled infrastructure, this fork also adds:

- **Custom AI providers** with XML tool-call parsing, for OpenAI-compatible / local models (e.g. Ollama)
- **SMTP email delivery** as an alternative to Resend, with a built-in email test button
- **Sidebar visibility toggles** for Lookouts, XQL, Voice, and Search Modes
- **User-configurable default model** and per-task tertiary model preferences
- **Embedding provider configuration**, including OpenAI-compatible endpoints, for the hybrid RAG pipeline

## All-Cloud Configuration

If you'd rather not run the bundled services, Zetora can run entirely against managed/cloud providers, closer to the original Scira setup. Don't start the corresponding compose services and set the matching environment variables instead:

| Self-hosted service | Cloud alternative | Configuration |
|---|---|---|
| Postgres | Vercel Postgres / Neon / Supabase | `DATABASE_URL` (+ optional `READ_DB_1`/`READ_DB_2` read replicas) |
| Redis | Upstash Redis | `REDIS_URL` |
| MinIO | Cloudflare R2 / Vercel Blob | `STORAGE_PROVIDER=cloudflare-r2` (default) with R2 credentials |
| Qdrant | — (disabled) | leave `QDRANT_URL` unset to disable the vector cache |
| SearXNG | Tavily / Exa | `TAVILY_API_KEY`, `EXA_API_KEY` (used automatically when `SEARXNG_URL` is unset) |
| Sandbox | Daytona | `SANDBOX_PROVIDER=daytona` (default) with `DAYTONA_API_KEY` |
| FalkorDB + Graphiti | Supermemory | `SUPERMEMORY_API_KEY` |
| BullMQ | Upstash QStash | `QSTASH_TOKEN` and related QStash variables |

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
   - `DATABASE_URL` — a Postgres connection string. You can use the self-hosted Postgres for this: start it alone with `docker compose --env-file .env.prod up -d postgres` and connect to `postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/zetora`.
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

You can optionally bring up any other bundled service on its own (Redis, MinIO, Qdrant, SearXNG, sandbox, Graphiti) with `docker compose --env-file .env.prod up -d <service>` and point the matching `.env.local` variables at `localhost:<port>`.

### Option 2 — Self-hosted stack (Docker Compose)

Use this to deploy the full stack (app + Postgres, Redis, MinIO, Qdrant, SearXNG, sandbox, Graphiti/FalkorDB, BullMQ) on a server.

1. Clone the repository on the server:
   ```bash
   git clone <your-repo-url> zetora
   cd zetora
   ```
2. Create `.env.prod` (gitignored — never commit it). Fill in at least:
   - **Domain**: `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_BASE_URL`, `ALLOWED_ORIGINS` — set to your public URL (e.g. `https://zetora.example.com`).
   - **Core secrets**: `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), `POSTGRES_PASSWORD`.
   - **MinIO**: `MINIO_ROOT_PASSWORD` (and optionally `MINIO_ROOT_USER`, `S3_PUBLIC_URL`).
   - **AI providers**: at least one provider API key.
   - Optional but recommended: `BULLMQ_REDIS_PASSWORD`, Graphiti `GRAPHITI_LLM_*`/`GRAPHITI_EMBEDDING_*` keys, OAuth provider credentials, payment provider keys.

   See `.env.example` for the full list of available variables, and the comments at the top of `docker-compose.yml` for how to drop optional services.
3. Build and start the stack:
   ```bash
   docker compose --env-file .env.prod up -d --build
   ```
   This builds the `zetora.app` image and starts every bundled service on the `zetora-network`.
4. Apply database migrations against the dockerized Postgres (exposed on `127.0.0.1:5432`). From a machine with `pnpm install` already run (so `drizzle-kit` is available):
   ```bash
   DATABASE_URL=postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/zetora pnpm drizzle-kit migrate
   ```
5. Put a reverse proxy with TLS in front of `zetora.app` (port 3000) for your domain. All other services (Postgres, Redis, MinIO, Qdrant, SearXNG, sandbox, FalkorDB, Graphiti, BullMQ) are bound to `127.0.0.1` only — use an SSH tunnel if you need direct access to an admin UI (MinIO console on `:9001`, Bull Board on `:3001`, Qdrant dashboard on `:6333`, SearXNG on `:8080`, FalkorDB browser on `:3002`).
6. Visit your domain — Zetora should be up and running.

To drop an optional service (MinIO, Qdrant, SearXNG, sandbox, Graphiti, BullMQ), remove its block from `docker-compose.yml` along with the matching environment variables on `zetora.app`; the app falls back to its cloud defaults as described in [All-Cloud Configuration](#all-cloud-configuration).

# License

This project is licensed under the AGPLv3 License - see the [LICENSE](LICENSE) file for details.
