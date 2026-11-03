# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

fabrik-js is a factory-management system (materials, locations, machines, workers, recipes, supply arrival, production with signed stock movements and batch genealogy/recall). It is a pnpm + Turborepo monorepo, ESM/TypeScript throughout. Docs and UI are in Spanish; `docs/` (especially `docs/arquitectura.md`) holds the detailed product/architecture documentation.

## Commands

Requires Node ≥ 20 and pnpm 10.30.3 (pinned via `packageManager`).

```bash
pnpm install
pnpm build            # turbo; builds @fabrik/domain before its consumers
pnpm test             # turbo; all packages (needs domain dist/ built — turbo handles via ^build)
pnpm check            # biome check . (format + lint + imports, whole repo)
pnpm check:fix        # biome check --write .

pnpm dev:api          # NestJS watch, :3001
pnpm dev:web          # admin panel, :3000 (needs the API running)
pnpm dev:web-demo     # standalone demo, :3000 (no backend)
```

API setup from scratch: `cp apps/api/.env.example apps/api/.env`, then `pnpm --filter api db:migrate` and `pnpm --filter api db:seed`.

Per-package tests (Vitest everywhere):

```bash
pnpm --filter @fabrik/domain test
pnpm --filter api test            # unit
pnpm --filter api test:e2e        # supertest over temp SQLite; separate vitest.config.e2e.ts
pnpm --filter web test
pnpm --filter @fabrik/web-demo test
# single file / test name
pnpm --filter api exec vitest run path/to/file.spec.ts -t "name"
pnpm --filter @fabrik/domain typecheck
pnpm --filter api db:generate     # drizzle-kit migration generation
```

## Architecture

- **`packages/domain` (`@fabrik/domain`)** — pure DDD: entities, value objects, use cases, events, ports, errors. **Zero runtime deps; must never import NestJS, Next, Drizzle, Turso, or `node:*`.** Internal dependency order: `value-objects → errors → events → entities → ports → use-cases`. It is consumed **compiled** (`exports` → `dist/index.js`), so **rebuild it (`pnpm build`) after changing it** before running app tests/dev; relative imports in its source need explicit `.js` extensions.
- **`apps/api`** — NestJS 12 + Drizzle + Turso (SQLite, `FABRIK_DB_FILE`). Implements the domain's repository ports and `UnitOfWork` (transactional), exposes use cases as REST (JWT auth hand-rolled with HMAC-SHA256 + scrypt, no auth libs). Each resource lives in `src/<resource>/` with `*.controller.ts` + `*.dto.ts` + `*.module.ts`. zod is the single source of validation and types; OpenAPI is generated from the same zod schemas, with an explicit `OPENAPI_ROUTES` table — an e2e anti-drift test fails if you add a route without documenting it. A global filter maps `DomainError` → HTTP (404/403/409/422).
- **`apps/web`** — Next.js 16 client-rendered admin panel. Components never call axios directly; use per-resource modules in `lib/api/modules/*` and `useApiQuery`. Wire DTOs in `lib/api/types.ts` mirror API serializers exactly; ids are opaque strings.
- **`apps/web-demo`** — fork of `apps/web` where the data modules call domain use cases in-browser over `sessionStorage` (`fabrik.demo.db`) instead of HTTP. Changes to shared UI/data-module behavior in `apps/web` often need mirroring here.

Key conventions:
- Use cases are the boundary: controllers/demo modules only convert input, call `useCase.execute(actor, command)` with an explicit `Actor { workerId, role }`, and serialize. Authorization (`requireRole` → `UnauthorizedRoleError`) lives in use cases, not entities or controllers.
- `batch_events` and `stock_movements` are append-only (no UPDATE/DELETE); events publish after persistence/commit.
- The server clock is the source of truth for dates (`FABRIK_ALLOW_CLIENT_TIMESTAMP` is for e2e only).
- The auth guard is global; public routes need an explicit `@Public()`.

## Style

Biome (single root config, 2-space indent, line width 100) handles formatting, lint and import ordering; run `pnpm check` before committing. CI (`.github/workflows/ci.yml`) runs lint, format check, domain typecheck, build and all test suites. Demo deploys to GitHub Pages via `deploy-demo.yml` when `apps/web-demo/` changes.
