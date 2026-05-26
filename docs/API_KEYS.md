# API Keys — Collection Guide

Everything you need to fill in `.env` (copy from `.env.example`). Do each section in order. Total time: ~20–30 min. Keep all secrets private — never commit `.env`.

> Quick map of what you'll end up with:
>
> | Service | Gives you | `.env` variables |
> |---------|-----------|------------------|
> | Supabase | DB + Auth + vectors | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
> | OpenRouter | AI models + embeddings | `OPENROUTER_API_KEY`, `OPENROUTER_CHAT_MODEL`, `OPENROUTER_EMBEDDING_MODEL` |
> | Discord | bot that reads mentions | `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID` |
> | Upstash | Redis for reminders/queues | `REDIS_URL` |

---

## 1. Supabase (database, auth, vectors)

1. Go to **https://supabase.com** → **Sign in** (GitHub is easiest).
2. Click **New project**.
   - Pick/create an **Organization**.
   - **Name:** `ai-sync-copilot`.
   - **Database Password:** click *Generate*, then **copy and save it somewhere safe** — you need it for `DATABASE_URL`.
   - **Region:** closest to you.
   - Click **Create new project** and wait ~2 min for it to provision.
3. **Get the API keys:** left sidebar → **Project Settings** (gear) → **API**.
   - **Project URL** → this is both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`.
   - **`anon` `public` key** → this is `SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - **`service_role` `secret` key** (click *Reveal*) → this is `SUPABASE_SERVICE_ROLE_KEY`. **Server-only — never put this in the web or extension client.**
   > Newer Supabase projects may label these under **API Keys** as **Publishable key** (= anon) and **Secret key** (= service_role). Either naming works.
4. **Get the database connection string:** **Project Settings** → **Database** → **Connection string** → **URI** tab.
   - Copy the string and replace `[YOUR-PASSWORD]` with the password from step 2 → this is `DATABASE_URL`.
   - Use the **direct connection** (port `5432`) for running Drizzle migrations.
5. **Enable pgvector:** left sidebar → **Database** → **Extensions** → search `vector` → toggle it **on**. (Or run `create extension if not exists vector;` in the SQL editor.)

✅ You now have 6 values: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## 2. OpenRouter (AI models + embeddings)

1. Go to **https://openrouter.ai** → **Sign in** (Google/GitHub).
2. **Add credit:** top-right avatar → **Credits** → add a small amount (e.g. $5). Gemini Flash is very cheap, so this lasts a long time.
3. **Create the key:** avatar → **Keys** → **Create Key** → name it `ai-sync-copilot` → **Create** → **copy it now** (shown once) → this is `OPENROUTER_API_KEY`.
4. **Pick models** (browse at https://openrouter.ai/models):
   - `OPENROUTER_CHAT_MODEL=google/gemini-flash-1.5` (cheap/fast for MVP; swap to `anthropic/claude-sonnet-4` later for higher quality).
   - `OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small` (1536 dims — matches the DB schema).

> ⚠️ **Embeddings note:** OpenRouter's embedding-model coverage is narrower than its chat coverage. If embedding calls fail for your account, get an **OpenAI** key instead (https://platform.openai.com/api-keys → *Create new secret key*) and use that for embeddings only. If you switch the embedding model, make sure its dimension matches the `vector(N)` column in `docs/DATABASE.md`.

✅ You now have: `OPENROUTER_API_KEY`, `OPENROUTER_CHAT_MODEL`, `OPENROUTER_EMBEDDING_MODEL`.

---

## 3. Discord (the bot that reads mentions)

1. Go to **https://discord.com/developers/applications** → **New Application** → name it `AI Sync Copilot` → **Create**.
2. On the **General Information** page, copy **Application ID** → this is `DISCORD_CLIENT_ID`.
3. Left sidebar → **Bot**:
   - Click **Reset Token** → **copy the token** → this is `DISCORD_BOT_TOKEN`. **Keep it secret** (anyone with it controls your bot).
   - Scroll to **Privileged Gateway Intents** and enable **MESSAGE CONTENT INTENT** (required to read message text). Enable **SERVER MEMBERS INTENT** too (to map mentions to users). **Save Changes.**
4. **Invite the bot to your server:** left sidebar → **OAuth2** → **URL Generator**:
   - **Scopes:** check `bot` (and `applications.commands`).
   - **Bot Permissions:** check **View Channels**, **Send Messages**, **Read Message History**, **Add Reactions**.
   - Copy the **Generated URL** at the bottom, open it in a new tab, pick your server, **Authorize**.
5. (You'll need a Discord server you own/admin. If you don't have one: open Discord → **+** → *Create My Own*.)

✅ You now have: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`.

---

## 4. Upstash (Redis for reminders & queues)

1. Go to **https://upstash.com** → **Sign in** → **Console**.
2. **Create database** → choose **Redis**.
   - **Name:** `ai-sync-copilot`.
   - **Primary Region:** closest to your backend's deploy region.
   - Leave the rest default → **Create**.
3. On the database page, find **Connect to your database** → choose the **Node / ioredis** tab (TCP), and copy the connection string. It looks like `rediss://default:<password>@<host>:6379` → this is `REDIS_URL`.

> 💡 For local dev instead of Upstash, run `docker run -d -p 6379:6379 redis:7` and set `REDIS_URL=redis://localhost:6379`.
>
> ⚠️ BullMQ on Upstash needs `maxRetriesPerRequest: null` on the ioredis client — the backend already sets this.

✅ You now have: `REDIS_URL`.

---

## 5. Put it all together

```bash
cp .env.example .env
```

Open `.env` and paste each value next to its variable (the tables/checkmarks above tell you which goes where). Then verify nothing is empty:

```bash
grep -nE '=$' .env   # lists any variables you still need to fill in
```

---

## 6. Later — deployment accounts (no `.env` keys needed now)

When you're ready to go live (see `docs/PRODUCTION.md`):

- **Vercel** (https://vercel.com) — host the web app. Sign in with GitHub, import the repo, set the `NEXT_PUBLIC_*` + Supabase env vars in the project settings.
- **Railway** (https://railway.app) or **Render** (https://render.com) — host the Fastify backend. Add all backend env vars there.
- **Supabase / Upstash** — already created above; reuse the same connection strings in production (or create separate prod instances).
