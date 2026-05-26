# AI Sync Copilot

An AI-powered developer **execution alignment assistant**. It reads Discord mentions, turns them into tasks, reminds developers about pending work, and explains tasks using local repo context — so developers stop forgetting work, stay synced, and understand what to do.

> This is **not** an AI coding replacement or autonomous engineer. The AI only *suggests*; the developer stays in control.

## The core flow

```
Manager sends a Discord message
        ↓
AI extracts a task
        ↓
VS Code shows a notification
        ↓
AI explains what likely needs to be done (repo-aware)
        ↓
AI reminds until the task is completed
        ↓
AI generates the standup summary
```

If this flow works beautifully, the MVP is successful.

## Monorepo layout

```
apps/
  web/        Next.js app — auth, onboarding, settings, integrations
  api/        Fastify backend — Discord webhooks, AI extraction, reminders, summaries
  extension/  VS Code extension — task UI, repo indexing, local RAG, notifications
packages/
  shared/     Shared TypeScript types, Zod schemas, constants
```

## Tech stack

| Area        | Choice |
|-------------|--------|
| Web         | Next.js, TypeScript, Tailwind, shadcn/ui |
| Backend     | Fastify, TypeScript, Zod |
| ORM         | Drizzle |
| DB / Auth   | Supabase (PostgreSQL + pgvector + Supabase Auth) |
| Queue       | BullMQ + Redis |
| AI          | OpenRouter (Gemini Flash now, Claude Sonnet later) |
| Embeddings  | OpenRouter |
| Extension   | VS Code Extension API, TypeScript |

## Documentation

- [docs/PRODUCT.md](docs/PRODUCT.md) — goal, scope, principles, success metric
- [docs/USER_STORIES.md](docs/USER_STORIES.md) — personas, epics, acceptance criteria
- [docs/UX_FLOWS.md](docs/UX_FLOWS.md) — user journeys, screens, states
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — colors, typography, components, tokens
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components and data flow
- [docs/DATABASE.md](docs/DATABASE.md) — schema
- [docs/ROADMAP.md](docs/ROADMAP.md) — 4-week build plan
- [docs/DECISIONS.md](docs/DECISIONS.md) — locked technical decisions
- [docs/SETUP.md](docs/SETUP.md) — local dev setup and environment variables
- [docs/API_KEYS.md](docs/API_KEYS.md) — step-by-step guide to collect every API key
- [docs/PRODUCTION.md](docs/PRODUCTION.md) — production checklist and deployment

## Quickstart

```bash
pnpm install
cp .env.example .env   # then fill in values — see docs/SETUP.md
pnpm dev               # runs all apps via Turborepo
```

See [docs/SETUP.md](docs/SETUP.md) for prerequisites (Supabase, Discord bot, OpenRouter, Redis).
