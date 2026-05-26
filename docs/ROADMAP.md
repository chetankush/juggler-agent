# Build Roadmap (4 weeks)

## Week 1 — Core backend

- **Step 1 — Monorepo setup.** `apps/{web,api,extension}`, `packages/shared`. pnpm workspaces + Turborepo.
- **Step 2 — Supabase setup.** Auth, Postgres, `pgvector` extension, create tables.
- **Step 3 — Fastify backend.** Install Fastify, Zod, Drizzle, BullMQ, Redis. Create `/routes`, `/services`, `/queues`, `/lib`.
- **Step 4 — Discord bot.** `discord.js`. Read mentions, read threads, send reminders.
- **Step 5 — Discord webhook flow.** On message: detect mention → AI extraction → create task → store in DB.
- **Step 6 — AI task extraction.** Structured JSON prompts via OpenRouter. (See ARCHITECTURE.md for the I/O contract.)

## Week 2 — Web app + extension

- **Step 7 — Next.js app.** Pages: login, onboarding, settings, integrations. Supabase Auth.
- **Step 8 — VS Code extension setup.** Sidebar, task list, login flow.
- **Step 9 — Extension auth.** Authenticate with Supabase JWT.
- **Step 10 — Task sidebar.** Active / blocked / completed tasks.
- **Step 11 — Notifications.** WebSocket events + polling. New task / stale task / deadline alerts.

## Week 3 — Repo context + RAG

- **Step 12 — Local repo scanner.** Scan `.ts`/`.js` files, folders, functions. Exclude `node_modules`, `.env`, `dist`, `build`, `.git`.
- **Step 13 — Chunking.** By function / class / module.
- **Step 14 — Generate embeddings.** OpenRouter embeddings → store in Supabase pgvector.
- **Step 15 — Local RAG search.** On task open: search embeddings → retrieve relevant chunks → send only relevant context to AI.
- **Step 16 — AI explain task.** "Explain Task" returns likely issue, relevant files, implementation guidance. **AI only suggests; developer stays in control.**

## Week 4 — Reminders + polish

- **Step 17 — Reminder queue.** BullMQ + Redis. Types: inactive task, approaching deadline, stale work.
- **Step 18 — Discord reminders.** e.g. "You still have 2 pending high-priority tasks." / "No progress detected on auth retry task."
- **Step 19 — End-of-day summary.** AI asks "What tasks did you complete today?" → generate standup summary, blockers, pending tasks.
- **Step 20 — Polish UX.** Speed, simplicity, low friction, clean notifications.

## Progress tracking

Scaffolded + wired + builds green across all apps. Backend boots against live Docker Postgres+Redis; schema pushed; web↔API wired with optimistic UI; web↔extension auth handshake implemented.

- [x] Week 1 — Core backend (routes, Discord bot, extraction, queues; needs live keys to exercise)
- [x] Week 2 — Web app + extension (auth, pages, sidebar, notifications) — wired to API
- [x] Week 3 — Repo context + RAG (scanner, embeddings queue, pgvector HNSW, explain) — needs OpenRouter key to exercise
- [ ] Week 4 — Reminders + polish (queues built; tune cadence, standup UX, ui-audit + flow-qa pass)

**Remaining to be "live":** fill real Supabase/OpenRouter/Discord keys in `.env` (see docs/API_KEYS.md), then run ui-audit + flow-qa on the running app.
