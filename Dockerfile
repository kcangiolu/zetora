# syntax=docker.io/docker/dockerfile:1

# Base image: Using Node.js 22 with Alpine Linux for a minimal footprint
FROM node:22-alpine AS base

# Stage 1: Dependencies
# This stage is responsible for installing all npm dependencies
FROM base AS deps
# Installing libc6-compat for Alpine Linux compatibility with certain Node.js packages
# Required for some npm packages that have native dependencies
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files and install dependencies using pnpm
# pnpm is used for faster and more efficient package management
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN corepack enable pnpm && pnpm i;

# Stage 2: Building the application
# This stage builds the Next.js application
FROM base AS builder
WORKDIR /app
# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy all source files
COPY . .

# env/server.ts is validated (via jiti) during `next build`, and requires
# DATABASE_URL/BETTER_AUTH_SECRET to be set. These build-time values are only
# used for that validation — real values are supplied at runtime via
# docker-compose environment/env_file.
ARG DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ARG BETTER_AUTH_SECRET=build-time-placeholder-secret
# Some SDKs (DodoPayments, Supermemory) validate their API key/bearer token
# eagerly at module-load time, which Next.js triggers during page-data
# collection. Placeholders satisfy those checks without baking real secrets
# into the image.
ARG DODO_PAYMENTS_API_KEY=build-time-placeholder-dodo-key
ARG DODO_PAYMENTS_WEBHOOK_SECRET=build-time-placeholder-dodo-webhook-secret
ARG SUPERMEMORY_API_KEY=build-time-placeholder-supermemory-key
ARG POLAR_WEBHOOK_SECRET=build-time-placeholder-polar-webhook-secret
ENV DATABASE_URL=${DATABASE_URL} \
    BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET} \
    DODO_PAYMENTS_API_KEY=${DODO_PAYMENTS_API_KEY} \
    DODO_PAYMENTS_WEBHOOK_SECRET=${DODO_PAYMENTS_WEBHOOK_SECRET} \
    SUPERMEMORY_API_KEY=${SUPERMEMORY_API_KEY} \
    POLAR_WEBHOOK_SECRET=${POLAR_WEBHOOK_SECRET}

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so the
# production values must be passed as build args (see docker-compose.yml).
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_MCP_ENABLED=false
ARG NEXT_PUBLIC_CANVAS_ENABLED=false
ARG NEXT_PUBLIC_MCP_SANDBOX_ORIGIN
ARG NEXT_PUBLIC_VOICE_BACKEND_URL
ARG NEXT_PUBLIC_STARTER_TIER
ARG NEXT_PUBLIC_STARTER_SLUG
ARG NEXT_PUBLIC_PREMIUM_TIER
ARG NEXT_PUBLIC_PREMIUM_SLUG
ARG NEXT_PUBLIC_MAX_TIER
ARG NEXT_PUBLIC_MAX_SLUG
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_MCP_ENABLED=${NEXT_PUBLIC_MCP_ENABLED} \
    NEXT_PUBLIC_CANVAS_ENABLED=${NEXT_PUBLIC_CANVAS_ENABLED} \
    NEXT_PUBLIC_MCP_SANDBOX_ORIGIN=${NEXT_PUBLIC_MCP_SANDBOX_ORIGIN} \
    NEXT_PUBLIC_VOICE_BACKEND_URL=${NEXT_PUBLIC_VOICE_BACKEND_URL} \
    NEXT_PUBLIC_STARTER_TIER=${NEXT_PUBLIC_STARTER_TIER} \
    NEXT_PUBLIC_STARTER_SLUG=${NEXT_PUBLIC_STARTER_SLUG} \
    NEXT_PUBLIC_PREMIUM_TIER=${NEXT_PUBLIC_PREMIUM_TIER} \
    NEXT_PUBLIC_PREMIUM_SLUG=${NEXT_PUBLIC_PREMIUM_SLUG} \
    NEXT_PUBLIC_MAX_TIER=${NEXT_PUBLIC_MAX_TIER} \
    NEXT_PUBLIC_MAX_SLUG=${NEXT_PUBLIC_MAX_SLUG}

# Build the Next.js application
RUN npm run build

# Stage 3: Production runtime
# Final stage that runs the application
FROM base AS runner
LABEL org.opencontainers.image.name="zetora.app"
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Copy only the necessary files for running the application
# Static files for serving
COPY --from=builder /app/public ./public

# Copy the standalone build output and static files
# Using Next.js output tracing to minimize the final image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user for security
USER nextjs

# Expose the port the app runs on
EXPOSE 3000

# Configure the server
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the Next.js application
CMD ["node", "server.js"]
