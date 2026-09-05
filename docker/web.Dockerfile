# =============================================================================
# ForgeMind Web — Dockerfile
# Multi-stage build for Next.js standalone output
# =============================================================================

# ── Stage 1: Base ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ── Stage 2: Install dependencies ────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 3: Build ────────────────────────────────────────────────────────────
FROM base AS builder
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_STANDALONE=true

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY packages/typescript-config ./packages/typescript-config
COPY packages/types ./packages/types
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY apps/web ./apps/web
COPY turbo.json ./

WORKDIR /app/apps/web
RUN pnpm run build

# ── Stage 4: Runner ───────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 forgemind && \
    adduser --system --uid 1001 forgemind

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=forgemind:forgemind /app/apps/web/.next/standalone ./
COPY --from=builder --chown=forgemind:forgemind /app/apps/web/.next/static ./.next/static

USER forgemind

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
