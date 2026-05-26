# Local Setup

## Prerequisites

- Node.js >= 20 (repo developed on Node 24)
- pnpm >= 9
- Docker (runs the dev Postgres + Redis)
- A Supabase project (used for **Auth** in dev; full DB in prod)
- A Discord application + bot token
- An OpenRouter API key

## Install

```bash
pnpm install
```

## Environment variables

Copy the template and fill it in:

```bash
cp .env.example .env
```

| Variable | Used by | Description |
|----------|---------|-------------|
| `DATABASE_URL` | api | Supabase Postgres connection string (pooled or direct) |
| `SUPABASE_URL` | api, web | Supabase project URL |
| `SUPABASE_ANON_KEY` | web, extension | Public anon key (client auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | api | Service role key (server-only, never ship to client) |
| `NEXT_PUBLIC_SUPABASE_URL` | web | Same as `SUPABASE_URL`, exposed to browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Same as anon key, exposed to browser |
| `REDIS_URL` | api | Redis / Upstash connection string |
| `OPENROUTER_API_KEY` | api, extension | OpenRouter key for chat + embeddings |
| `OPENROUTER_CHAT_MODEL` | api | e.g. `google/gemini-flash-1.5` |
| `OPENROUTER_EMBEDDING_MODEL` | api, extension | embedding model id |
| `DISCORD_BOT_TOKEN` | api | Discord bot token |
| `DISCORD_CLIENT_ID` | api | Discord application client id |
| `API_BASE_URL` | web, extension | Base URL of the Fastify backend |

## Run

```bash
# all apps via Turborepo
pnpm dev

# or individually
pnpm --filter @aicrm/api dev
pnpm --filter @aicrm/web dev
pnpm --filter @aicrm/extension dev
```

## Local services (Docker) — start these first

Dev runs Postgres (with pgvector) and Redis in Docker on **non-default ports** so they
won't clash with anything already on your machine:

| Service | Host port | Connection |
|---------|-----------|------------|
| Postgres (pgvector) | **5435** | `postgresql://aicrm:aicrm@localhost:5435/aicrm` |
| Redis | **6382** | `redis://localhost:6382` |

```bash
docker compose up -d      # start postgres + redis
docker compose ps         # confirm both are healthy
docker compose down       # stop (keeps data)
docker compose down -v    # stop and wipe data
```

These match the default `DATABASE_URL` / `REDIS_URL` in `.env.example`, so no extra config is needed for dev. The `vector` extension is enabled automatically on first init.

## Database (schema)

```bash
# generate SQL migrations from the Drizzle schema
pnpm --filter @aicrm/api db:generate

# push schema to the running database (local Docker in dev, Supabase in prod)
pnpm --filter @aicrm/api db:push
```
