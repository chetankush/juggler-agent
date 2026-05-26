# CLAUDE.md

Guidance for working in this repo. Read this first.

## What this is

**AI Sync Copilot** — an AI developer *execution alignment assistant*. It reads Discord mentions, turns them into tasks, reminds developers, and explains tasks using local repo context (RAG). The AI **only suggests**; the developer stays in control. It is **not** an autonomous coder. See [docs/PRODUCT.md](docs/PRODUCT.md).

## Monorepo layout

```
apps/web/        Next.js — auth, onboarding, settings, integrations (→ Vercel)
apps/api/        Fastify — Discord, AI extraction, reminders, summaries (→ Railway/Render)
apps/extension/  VS Code extension — task UI, repo scan, local RAG, notifications
packages/shared/ shared TS types, Zod schemas, constants
```

`apps/api` internal layout: `/routes`, `/services`, `/queues`, `/lib`.

## Stack (locked — see docs/DECISIONS.md)

- pnpm workspaces + Turborepo
- Backend: Fastify + TypeScript + Zod
- ORM: **Drizzle** (schema in `apps/api/src/db/schema.ts`)
- DB/Auth: Supabase (Postgres + pgvector + Supabase Auth)
- Queue: BullMQ + Redis
- AI: OpenRouter (Gemini Flash now, Claude Sonnet later); **embeddings via OpenRouter**
- Web: Next.js + Tailwind + shadcn/ui

## Commands

```bash
pnpm install
pnpm dev                              # all apps (Turborepo)
pnpm --filter @aicrm/api dev          # one app
pnpm --filter @aicrm/api db:generate  # Drizzle migrations
pnpm --filter @aicrm/api db:push      # push schema to Supabase
pnpm lint
pnpm typecheck
```

## Conventions

- Workspace packages are namespaced `@aicrm/*`.
- Shared types/schemas live in `packages/shared` — define a type once, import everywhere. Do not duplicate Zod schemas across apps.
- AI calls go through `apps/api/src/lib` clients; don't scatter raw fetch calls.
- Secrets only in `.env` (see [docs/SETUP.md](docs/SETUP.md)); the service role key is server-only and must never reach the web/extension client.
- Keep the MVP scope tight — do **not** build anything in the "Do NOT build" list in docs/PRODUCT.md (Slack, Teams, billing, autonomous coding, etc.).

## Where to look

- Product & scope → [docs/PRODUCT.md](docs/PRODUCT.md)
- User stories & acceptance criteria → [docs/USER_STORIES.md](docs/USER_STORIES.md)
- UX flows & screens → [docs/UX_FLOWS.md](docs/UX_FLOWS.md)
- Architecture & data flow → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Design system (tokens/components) → [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- DB schema → [docs/DATABASE.md](docs/DATABASE.md)
- Build plan / current step → [docs/ROADMAP.md](docs/ROADMAP.md)
- Setup & env vars → [docs/SETUP.md](docs/SETUP.md)
- Collecting API keys → [docs/API_KEYS.md](docs/API_KEYS.md)
- Production & deployment → [docs/PRODUCTION.md](docs/PRODUCTION.md)
