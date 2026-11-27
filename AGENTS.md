# Project knowledge base

**Generated:** 2026-11-21 (UTC)  
**Commit:** `b5ddd40` (base; guidance reflects the working tree)  
**Branch:** `main`

## Overview

InterviewForge is a local interview practice app: React/Vite frontend, Fastify/TypeScript backend, SQLite persistence, and local Ollama inference.

## Structure

```text
backend/src/routes/   Feature APIs and persistence orchestration
backend/prompts/      Versioned-in-source defaults and editable template registry
backend/migrations/   Ordered SQL applied by the app at startup
frontend/src/pages/   App screens; History lives in Dashboard
frontend/src/sandbox/ Isolated JS, DOM, and React exercise execution
shared/contracts.ts   Runtime schemas and transport types shared by both builds
scripts/qa/           Browser-test app and deterministic model fixture
tests/                Backend, API integration, and browser suites
```

## Where to look

| Task | Location | Notes |
|---|---|---|
| Add or change a request shape | `shared/contracts.ts`, matching route and page | Update runtime validation and consumers together. |
| Change navigation or layout | `frontend/src/main.tsx`, `frontend/src/styles.css`, `DESIGN.md` | Seven routes; page selection uses the pathname. |
| Change History or Review | `backend/src/routes/progress.ts`, `frontend/src/pages/ProgressPages.tsx` | Backend owns ordering, filtered totals, and paging. |
| Change mock timer or report | `backend/src/routes/mock.ts`, `frontend/src/pages/MockPage.tsx` | End and expiry share a close path; an open item becomes Ungraded, not Skipped. |
| Change local model settings | `backend/src/routes/settings.ts`, `frontend/src/pages/SettingsPage.tsx` | Include model-unavailable recovery in checks. |
| Change exercise execution | `frontend/src/sandbox/host.ts`, `frontend/vite.config.ts` | Cover both worker behavior and browser isolation. |
| Change backend internals | `backend/AGENTS.md` | App wiring, storage compatibility, and SSE. |
| Change model instructions | `backend/prompts/AGENTS.md` | Prompt registry, slots, and overrides. |

## Code map

Symbols checked with the TypeScript compiler parser. Reference counts are unmeasured.

| Symbol | Location | Role |
|---|---|---|
| `buildApp` | `backend/src/app.ts` | Shared Fastify factory for production and tests. |
| `api`, `stream` | `frontend/src/api.ts` | Same-origin JSON and SSE clients. |
| `registerProgressRoutes` | `backend/src/routes/progress.ts` | Dashboard, paginated History, and Review queries. |
| `registerMockRoutes` | `backend/src/routes/mock.ts` | Mock lifecycle and report reconstruction. |
| `runExercise` | `frontend/src/sandbox/host.ts` | Drives an isolated worker through an iframe and message channel. |

## Conventions

- Run commands from the repository root; the app resolves migrations and built frontend assets from there.
- Dev Vite proxies `/api` to loopback Fastify. Fastify serves `frontend/dist` after the production build.
- Use `frontend/src/api.ts` for API calls. Pass abort signals through long-running requests.
- Use API integration tests for persistence and filter behavior. Use Playwright for keyboard, timer, and reload behavior.

## Anti-patterns

- Do not evaluate exercise code in the page context, add `allow-same-origin` to the sandbox frame, or grant worker network access.
- Do not add CDN assets, remote inference, or a separate top-level History route.
- Do not re-sort, re-filter, or infer the full result count from a single History page in the client.

## Unique styles

- Preserve the mobile mode disclosure, skip link, visible focus, and live statuses described in `DESIGN.md`.
- Use existing plain-CSS tokens and local system fonts. Keep Markdown sanitized before rendering.

## Commands

```bash
pnpm seed              # Seed the configured local data directory.
pnpm dev               # Fastify watcher and Vite dev server.
pnpm typecheck
pnpm lint
pnpm test              # Vitest backend and API integration suites.
pnpm test:integration  # API integration tests only.
pnpm test:e2e          # Production build then Playwright.
pnpm build
pnpm start             # Serve the built assets through Fastify.
```

## Notes

- Node `>=20.19.0`; package manager pinned to `pnpm@10.19.0`.
- The full Vitest run includes real Ollama smoke coverage. Use `SKIP_OLLAMA_SMOKE=1` only when local Ollama is unavailable; report the skip.
- Playwright uses a fake model and temporary SQLite data. Set `PLAYWRIGHT_CHROME=1` to use installed Chrome.
