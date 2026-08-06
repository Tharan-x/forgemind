# ForgeMind — CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Sprint 1 planned: Authentication (Supabase Auth + RBAC)

---

## [0.1.0] — Sprint 0: Engineering Foundation

### Added

- **Monorepo structure** via Turborepo + pnpm workspaces
- **`apps/web`** — Next.js 15 application with React 19, TailwindCSS v4, App Router
- **`apps/api`** — Express 4 API with TypeScript, Helmet, CORS, Morgan logging
- **`packages/ui`** — Shared React component library (`@forgemind/ui`) with shadcn/ui pattern
- **`packages/shared`** — Shared runtime utilities (`@forgemind/shared`) — API builders, string helpers, validators
- **`packages/types`** — Shared TypeScript type definitions (`@forgemind/types`)
- **`packages/typescript-config`** — Shared tsconfigs (base, nextjs, node)
- **`packages/eslint-config`** — Shared ESLint configuration with TypeScript, import ordering, prettier integration
- **Prisma 6** — ORM initialization with Supabase dual-URL pattern (pooler + direct)
- **Docker** — Multi-stage Dockerfiles for api and web (non-root production runner)
- **docker-compose.yml** — Local development stack (web + api + postgres)
- **GitHub Actions CI** — Lint, type-check, and build pipeline
- **Husky + lint-staged** — Pre-commit hooks for code quality enforcement
- **Conventional Commits** — Enforced via `commit-msg` hook
- **`.env.example`** — Complete environment variable reference
- **`scripts/setup.js`** — Developer onboarding automation script
- **VS Code** — Recommended extensions and workspace settings

---

## [0.0.1] — Repository Initialized

### Added

- Baseline repository structure
- Documentation placeholders (README, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG)
- Root configuration (.gitignore, .editorconfig, .eslintrc, .prettierrc)
- GitHub directory structure
