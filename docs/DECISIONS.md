# Technical Decisions

Locked decisions for the MVP. Update this file when a decision changes, with a date and reason.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package manager | pnpm workspaces | Fast, disk-efficient, first-class monorepo support |
| Build orchestration | Turborepo | Task caching across apps; cheap to add |
| Backend framework | Fastify + TypeScript | Fast, lightweight, simple — good fit for an AI product |
| Validation | Zod | Shared schemas between apps via `packages/shared` |
| ORM | **Drizzle** | Lightweight, TS-native, SQL-first; clean pgvector + Supabase fit |
| DB / Auth | Supabase (Postgres + pgvector + Supabase Auth) | Single managed provider for db, vectors, and auth |
| Queue | BullMQ + Redis | Mature job/reminder scheduling |
| AI provider | OpenRouter | One API for chat + embeddings; model flexibility |
| Chat model | Gemini Flash (MVP), Claude Sonnet (later) | Cheap/fast now; upgrade quality later |
| Embeddings | **OpenRouter** | Keep a single provider/key for all AI calls |
| Frontend | Next.js + TypeScript + Tailwind + shadcn/ui | Standard, productive web stack |
| Extension | VS Code Extension API + TypeScript | Required target surface |

## Deployment targets

| Component | Platform |
|-----------|----------|
| Web | Vercel |
| Backend | Railway / Render |
| Redis | Upstash |
| Database | Supabase |

## Open items / to confirm later

- Exact OpenRouter embedding model + its vector dimension (schema currently assumes `vector(1536)`).
- WebSocket vs polling balance for extension notifications (start with polling, add WS if needed).
