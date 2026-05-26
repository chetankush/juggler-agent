# Production Readiness & Deployment

Goal: a real, usable product — not a demo. This is the checklist + deploy guide to get there.

## Pre-launch checklist

### Security
- [ ] `service_role` key used **only** in `apps/api` (never shipped to web/extension).
- [ ] All secrets in the host's env settings, never committed. `.env` is gitignored.
- [ ] Supabase **Row Level Security (RLS)** enabled on every table; policies scope rows to the user's workspace.
- [ ] CORS on the API restricted to the web app origin (not `*`) in production.
- [ ] Supabase JWT verified on every protected API route.
- [ ] Discord bot token + OpenRouter key rotated if ever exposed.

### Correctness & reliability
- [ ] DB migrations applied (`pnpm --filter @aicrm/api db:push`) and idempotent.
- [ ] Env validated at boot (`src/lib/env.ts`) — server refuses to start with bad required config.
- [ ] BullMQ workers run as a process that stays up (separate from the web request path).
- [ ] Graceful handling when OpenRouter / Discord are down (retries, clear errors, no crash).
- [ ] Rate limiting on public API routes (e.g. `@fastify/rate-limit`).
- [ ] Structured logging (pino) + a health check (`GET /health`) for the platform.

### UX / quality gates
- [ ] `pnpm typecheck` and `pnpm build` pass across all apps.
- [ ] **ui-audit** pass on the web app at mobile/tablet/desktop.
- [ ] **flow-qa** pass on the golden path (Discord → task → sidebar → explain → reminder → standup).
- [ ] Accessibility: contrast, keyboard nav, focus rings, labels (see DESIGN_SYSTEM.md).
- [ ] Empty/loading/error states exist for every list and async action.

## Deployment

### 1. Database — Supabase
Already provisioned (see API_KEYS.md). For prod, consider a separate Supabase project from dev. Apply schema:
```bash
DATABASE_URL=<prod-url> pnpm --filter @aicrm/api db:push
```
Enable RLS + policies before going live.

### 2. Redis — Upstash
Use the prod Upstash database's `REDIS_URL`. (TLS `rediss://`, `maxRetriesPerRequest: null`.)

### 3. Backend — Railway (or Render)
- Create a project from the GitHub repo, root = `apps/api`.
- Build: `pnpm install && pnpm --filter @aicrm/api build`. Start: `pnpm --filter @aicrm/api start`.
- Run the **queue worker** as a second service/process (same image, worker entrypoint) so reminders fire independently of HTTP.
- Set all backend env vars (DATABASE_URL, SUPABASE_*, REDIS_URL, OPENROUTER_*, DISCORD_*).
- Note the public URL → it becomes `NEXT_PUBLIC_API_BASE_URL` for the web app and `aicrm.apiBaseUrl` for the extension.

### 4. Web — Vercel
- Import the repo; set **Root Directory** to `apps/web` (and the monorepo build settings).
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL`.
- Add the deployed domain to Supabase **Auth → URL Configuration** (redirect URLs).

### 5. Extension — VS Code Marketplace (later)
- `pnpm --filter @aicrm/extension package` → produces a `.vsix`.
- Test via "Install from VSIX". Publish to the Marketplace with `vsce publish` once stable.
- Default `aicrm.apiBaseUrl` should point at the prod backend.

## Rollout order (fastest path to a usable product)
1. Supabase + Upstash live, schema pushed, RLS on.
2. Backend deployed; `GET /health` green; Discord bot online in your server.
3. Web app deployed; sign-up/login works; can connect Discord.
4. Verify the **golden path** end-to-end with a real Discord message.
5. Install the extension locally (VSIX), sign in, see the task, run "Explain Task".
6. Turn on reminders + daily summary.

When steps 1–6 work with real data, the MVP is usable in real life.
