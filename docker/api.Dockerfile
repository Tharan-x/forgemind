# =============================================================================
# ForgeMind API — Dockerfile
# Multi-stage build: deps → builder → runner
# =============================================================================

# ── Stage 1: Base with pnpm ───────────────────────────────────────────────────
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ── Stage 2: Install all workspace dependencies ───────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/shared/package.json ./packages/shared/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 3: Build packages then API ─────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY packages/typescript-config ./packages/typescript-config
COPY packages/types ./packages/types
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY turbo.json ./

WORKDIR /app/apps/api
RUN pnpm run db:generate
RUN pnpm run build

# ── Stage 4: Production runner ────────────────────────────────────────────────
FROM node:24-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production

# Copy only production deps
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/node_modules ./node_modules

# Prisma client (generated)
COPY --from=builder /app/apps/api/prisma ./prisma

# Run as non-root
RUN addgroup --system --gid 1001 forgemind && \
    adduser --system --uid 1001 forgemind
USER forgemind

EXPOSE 4000
ENV API_PORT=4000
ENV API_HOST=0.0.0.0

CMD ["node", "dist/index.js"]
