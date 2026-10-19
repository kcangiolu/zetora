# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS base

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

USER node
EXPOSE 8200
CMD ["node", "dist/index.js"]
