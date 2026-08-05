# ForgeMind

> **AI-Powered GitHub Repository Intelligence & Developer Onboarding SaaS Platform**

---

## 📌 Project Vision

**ForgeMind** is a professional AI-powered SaaS platform designed to transform how engineering teams understand, navigate, and onboard into unfamiliar GitHub repositories. By coupling AST symbol indexing and dependency graph generation with contextual Large Language Model (LLM) reasoning, ForgeMind synthesizes deep architectural insights, interactive visual diagrams, and real-time codebase Q&A.

---

## 🚀 Quick Start

### Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Node.js | 20.x |
| pnpm | 9.x |
| Docker | 24.x (optional) |

### Developer Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/forgemind.git
cd forgemind

# 2. Run the automated setup script
node scripts/setup.js

# 3. Fill in your environment variables
# Open .env and configure your Supabase credentials

# 4. Start all services in development mode
pnpm dev
```

Services will be available at:
- **Web** → http://localhost:3000
- **API** → http://localhost:4000/api/v1
- **Health** → http://localhost:4000/api/v1/health

---

## 🏗️ Monorepo Structure

```
forgemind/                          ← Turborepo monorepo root
├── apps/
│   ├── web/                        ← Next.js 15 frontend (port 3000)
│   └── api/                        ← Express API server (port 4000)
├── packages/
│   ├── ui/                         ← @forgemind/ui   Shared React components
│   ├── shared/                     ← @forgemind/shared  Utilities & constants
│   ├── types/                      ← @forgemind/types   TypeScript type definitions
│   ├── typescript-config/          ← @forgemind/typescript-config  Shared tsconfigs
│   └── eslint-config/              ← @forgemind/eslint-config  Shared ESLint rules
├── docker/
│   ├── api.Dockerfile              ← Multi-stage API production image
│   └── web.Dockerfile              ← Multi-stage web production image
├── scripts/
│   ├── setup.js                    ← Developer bootstrap script
│   └── clean.js                    ← Build artifact cleanup
├── docs/                           ← Architecture & engineering documentation
├── .github/workflows/ci.yml        ← GitHub Actions CI pipeline
├── docker-compose.yml              ← Local development Docker stack
├── turbo.json                      ← Turborepo pipeline configuration
├── pnpm-workspace.yaml             ← pnpm workspace configuration
├── .env.example                    ← Environment variable template
└── package.json                    ← Root package with workspaces
```

---

## 🛠️ Tech Stack

### Frontend (`apps/web`)
- **Next.js 15** — App Router, TypeScript, standalone output for Docker
- **React 19** — Latest stable with strict mode
- **TailwindCSS v4** — Utility-first styling with `@theme` token system
- **shadcn/ui** — Component library pattern via `@forgemind/ui`

### Backend (`apps/api`)
- **Express 4** — REST API with TypeScript
- **Prisma 6** — Type-safe database ORM
- **Supabase** — PostgreSQL database (Supabase-hosted)
- **Zod** — Runtime schema validation

### Infrastructure
- **Docker** — Multi-stage production builds (non-root user)
- **Docker Compose** — Local dev stack (web + api + postgres)
- **Turborepo** — Build pipeline with intelligent caching
- **pnpm 9** — Efficient monorepo package management

### Code Quality
- **ESLint** — TypeScript-aware linting with import ordering
- **Prettier** — Opinionated formatting
- **Husky** — Git hooks
- **lint-staged** — Pre-commit checks on staged files only

---

## 📦 Available Scripts

### Root (run from `d:/forgemind/`)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all packages and apps via Turbo |
| `pnpm lint` | Lint all packages |
| `pnpm lint:fix` | Auto-fix lint errors |
| `pnpm format` | Format all files with Prettier |
| `pnpm format:check` | Check formatting without writing |
| `pnpm type-check` | TypeScript type-check all packages |
| `pnpm clean` | Remove all build artifacts |
| `node scripts/setup.js` | First-time developer setup |

### API only (run from `apps/api/`)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start API with tsx watch (hot reload) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run Prisma migrations (dev) |
| `pnpm db:studio` | Open Prisma Studio |

---

## 🔧 Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase pooler connection string |
| `DIRECT_URL` | Supabase direct connection (for migrations) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Public Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret server-side Supabase key |
| `NEXT_PUBLIC_API_URL` | API base URL for the frontend |

---

## 🐳 Docker

### Start the full stack

```bash
docker-compose up --build
```

### Build individual images

```bash
# API
docker build -f docker/api.Dockerfile -t forgemind-api .

# Web
docker build -f docker/web.Dockerfile -t forgemind-web .
```

---

## 🎯 Problem Statement

Developer onboarding to large, legacy, or multi-repository codebases is slow, fragmented, and costly:
- **High Onboarding Overhead**: New engineers spend weeks manually tracing code flow and hunting for context.
- **Stale Documentation**: Internal wikis and READMEs decay quickly, leading to misleading architectural assumptions.
- **Knowledge Silos**: Critical architectural context remains trapped in the heads of a few senior developers.
- **Context Switching**: Interrogating code require manually navigating hundreds of files without high-level topological maps.

---

## ⭐ High-Level Features

- **Automated Repository Ingestion**: Deep AST-level parsing and symbol indexing for GitHub repositories.
- **Interactive Topology & Graph Visualizations**: Dynamic, node-based component and file relationship diagrams.
- **Contextual AI Codebase Assistant**: Chat with your codebase with precise source-file line attribution and semantic grounding.
- **Automated Onboarding Blueprinting**: Auto-generated walkthroughs tailored for newly onboarded developers.
- **Enterprise Security & Access Controls**: Strict RBAC and zero-retention data policies ensuring client code privacy.

---

## 🔄 Development Workflow

1. **Branching Strategy**: Feature Branch Workflow:
   - `main`: Production-ready release branch
   - `feature/*`: New features and capabilities
   - `fix/*`: Bug fixes and patch resolution
   - `chore/*`: Tooling, dependency updates, and maintenance
2. **Commit Conventions**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
3. **Pull Request Protocol**: All code additions require a PR. CI checks (lint, type-check, build) must pass. Minimum 1 peer review.

---

## 🏷️ Semantic Versioning

ForgeMind strictly adheres to [Semantic Versioning 2.0.0](https://semver.org/):
- **MAJOR (`X.0.0`)**: Incompatible API or structural breaking changes
- **MINOR (`0.X.0`)**: Backwards-compatible new feature additions
- **PATCH (`0.0.X`)**: Backwards-compatible bug fixes

---

## 🗺️ Roadmap

- [x] **v0.0.1 — Repository Initialized**: Baseline repository setup, structure, code hygiene, and doc placeholders.
- [x] **v0.1.0 — Engineering Foundation**: Monorepo configuration, build pipeline setup, shared packages, and CI automation.
- [ ] **v0.2.0 — Authentication**: Multi-tenant RBAC authentication, user session management, and OAuth integration.
- [ ] **v0.3.0 — Dashboard**: Project workspace UI, repository connection management, and status metrics.
- [ ] **v0.4.0 — Repository Intelligence**: Code parsing, AST symbol extraction, vector embeddings, and graph indexing.
- [ ] **v0.5.0 — AI Assistant**: Contextual chat engine, semantic Q&A, and interactive architectural diagram generation.
- [ ] **v1.0.0 — Initial Stable Release**: Production-ready platform release with full enterprise capabilities.

---

## 🤝 Contributing

We welcome contributions! Please review:
- [CONTRIBUTING.md](./CONTRIBUTING.md) for environment setup and submission standards
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community guidelines
