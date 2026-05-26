# Architecture

## Components

### 1. Next.js app (`apps/web`)

Handles:

- auth (Supabase Auth)
- onboarding
- settings
- integrations (connect Discord, configure workspace)

Deployed to **Vercel**.

### 2. Fastify backend (`apps/api`)

Handles:

- Discord bot + webhooks (mentions, threads)
- AI task extraction (OpenRouter)
- reminder scheduling (BullMQ + Redis)
- daily summaries
- REST/WS API consumed by the web app and the extension

Deployed to **Railway / Render**.

### 3. VS Code extension (`apps/extension`)

Handles:

- task UI (sidebar: active / blocked / completed)
- local repo scanning + chunking
- local RAG (embedding search against pgvector)
- notifications (new task, stale task, deadline)
- "Explain Task" — sends only relevant repo context to the AI

### 4. Supabase

Handles:

- auth (JWT)
- Postgres database
- pgvector embeddings storage

## Data flow — the core loop

```
Discord message (@mention)
   │  discord.js gateway / webhook
   ▼
apps/api  ──►  detect mention
   │           AI extraction service (OpenRouter, structured JSON)
   ▼
Supabase (tasks table)
   │
   ├──► reminders queue (BullMQ) ──► Discord reminder messages
   │
   ▼
apps/extension  (poll + websocket)
   │  shows task in sidebar + notification
   ▼
"Explain Task"  ──►  local RAG search (pgvector)
   │                 retrieve relevant chunks
   ▼
OpenRouter  ──►  explanation (likely issue, relevant files, guidance)
```

## AI task extraction

**Input** (a Discord mention):

```
@Chetan fix auth refresh issue before deployment
```

**Output** (structured JSON):

```json
{
  "title": "Fix auth refresh issue",
  "priority": "high",
  "deadline": "before deployment",
  "summary": "Fix JWT refresh logic"
}
```

Implementation: structured JSON prompts against OpenRouter (Gemini Flash for MVP, Claude Sonnet later).

## Repo context + RAG (extension)

1. **Scan** — walk `.ts`/`.js` files, folders, functions. Exclude `node_modules`, `.env`, `dist`, `build`, `.git`.
2. **Chunk** — by function / class / module.
3. **Embed** — via OpenRouter embeddings.
4. **Store** — in Supabase `repo_embeddings` (pgvector).
5. **Search** — when a task is opened, retrieve the relevant chunks and send *only* those to the AI.

## Reminders

BullMQ jobs on Redis. Reminder types:

- inactive task
- approaching deadline
- stale work (no progress detected)

## Backend directory layout (`apps/api`)

```
/routes     HTTP + webhook routes
/services   business logic (extraction, summaries, etc.)
/queues     BullMQ workers + producers
/lib        clients (supabase, openrouter, discord, redis)
```

## Deployment

| Component | Platform |
|-----------|----------|
| Web (frontend) | Vercel |
| Backend (api)  | Railway / Render |
| Redis          | Upstash |
| Database       | Supabase |
