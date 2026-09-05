# ForgeMind — CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — V1 Initial Release

### Added

- **AST Code Intelligence & Graph Engine**: Repository AST parsing, architecture dependency graph generation, and interactive node inspector.
- **Architectural Risk & Impact Analysis**: Architectural health scoring, circular dependency detection, and change impact blast-radius analysis.
- **Architecture Drift & Time Machine**: Historical architectural snapshot comparison and drift detection across commits.
- **What-If Simulation & Decision Memory**: Interactive architectural modification simulation and architectural decision records (ADR) management.
- **PR Gatekeeper & Onboarding**: Automated PR architecture impact scoring, gatekeeper rules, and automated developer onboarding blueprint generation.
- **Conversational Repository AI Assistant**: RAG engine with hybrid pgvector + AST retrieval, grounded source citations, Gemini cloud synthesis, and local deterministic offline fallback.
- **Security & Device Management**: Device-aware session tracking, HMAC webhook hardening, dual-URL Supabase database connection pooling (DATABASE_URL + DIRECT_URL), and encrypted secret management.
- **Full Monorepo Architecture**: Next.js 15 web interface (`apps/web`), Express 4 API backend (`apps/api`), multi-stage Docker builds, and complete integration test suites.

---

## [0.0.1] — Initial Project Foundation

### Added

- Monorepo structure via Turborepo + pnpm workspaces
- Core package and app modules (`apps/web`, `apps/api`, `packages/ui`, `packages/shared`, `packages/types`)
- Automated CI testing, linting, and formatting pipelines
