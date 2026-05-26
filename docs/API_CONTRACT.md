# API Contract

REST contract between `apps/web` / `apps/extension` (clients) and `apps/api` (Fastify). All types come from `@aicrm/shared` — never redefine them. Base URL = `NEXT_PUBLIC_API_BASE_URL` / `aicrm.apiBaseUrl` (default `http://localhost:3001`).

## Auth
Every route except `GET /health` requires a Supabase access token:
```
Authorization: Bearer <supabase access_token>
```
The API verifies it via `supabase.auth.getUser(token)` and resolves the current user. On first call for a new user, `GET /me` upserts the `users` row from the JWT (id, email, name).

## Conventions
- JSON in/out. Errors: `{ "error": string }` with appropriate 4xx/5xx status.
- Validation with the shared Zod schemas; 400 on failure with the issue.
- **Performance:** every list query is indexed (see below); responses are lean (no N+1). Clients use optimistic updates for mutations.

## Endpoints

### `GET /health` — public
→ `200 { "status": "ok" }`

### `GET /me`
Bootstraps the web app after auth. Upserts the user row.
→ `200 MeResponse` = `{ user, workspaces: Workspace[], currentWorkspace: Workspace | null }`

### `POST /workspaces`
Body: `createWorkspaceSchema` = `{ name: string }`. Owner = current user. Applies `DEFAULT_WORKSPACE_SETTINGS`.
→ `201 Workspace`

### `GET /workspaces/:id`
→ `200 Workspace` (404 if not owned by the user)

### `PATCH /workspaces/:id/settings`
Body: `workspaceSettingsSchema` = `{ reminderCadenceHours, workingHoursStart, workingHoursEnd, defaultModel }`.
→ `200 Workspace` (with updated `settings`)

### `GET /tasks?workspaceId=<uuid>&grouped=true`
- `grouped=true` → `200 GroupedTasks` = `{ active, blocked, completed }`
- otherwise → `200 Task[]`

### `POST /tasks`
Body: `createTaskSchema`. → `201 Task`

### `PATCH /tasks/:id`
Body: `updateTaskSchema` (e.g. `{ status: "completed" }`). Sets `updatedAt`. → `200 Task`

### `DELETE /tasks/:id`
→ `200 { "ok": true }`

### `POST /tasks/:id/explain`
Runs repo-RAG. → `200 TaskExplanation` = `{ likelyIssue, relevantFiles, suggestedApproach }`

### `GET /integrations/discord?workspaceId=<uuid>`
→ `200 DiscordIntegrationStatus` = `{ connected, guildName, channelName, inviteUrl }`.
`inviteUrl` is built from `DISCORD_CLIENT_ID` with scopes `bot applications.commands` and permissions for View Channels / Send Messages / Read History / Add Reactions; `null` if `DISCORD_CLIENT_ID` is unset.

### `DELETE /integrations/discord?workspaceId=<uuid>`
Unlinks the guild from the workspace. → `200 { "ok": true }`

### `POST /embeddings`
Body: `RepoChunk[]`. Enqueues embedding jobs. → `202 { "queued": number }`

## Schema additions (apps/api Drizzle)
- `workspaces.settings` — `jsonb` (NOT NULL, default `DEFAULT_WORKSPACE_SETTINGS`), typed as `WorkspaceSettings`.
- `workspaces.discord_guild_id` — `text` nullable.
- `workspaces.discord_guild_name` — `text` nullable.
- `workspaces.discord_channel_name` — `text` nullable.

## Required indexes (performance)
- `tasks (workspace_id, status)` — sidebar/dashboard grouping.
- `tasks (assigned_user_id)` — per-developer queries.
- `reminders (status, remind_at)` — due-reminder scans.
- `repo_embeddings` — pgvector ANN index (HNSW or IVFFlat) on `embedding` for fast cosine search.
- `workspaces (owner_id)`.

## Web → extension auth handshake
1. Extension `signIn()` opens **the web app** at `<webBaseUrl>/login?redirect_uri=vscode://aicrm.extension/auth`.
2. Web completes Supabase auth (via `/auth/callback` code exchange), then redirects to `vscode://aicrm.extension/auth?token=<access_token>`.
3. Extension `AuthUriHandler` stores the token in `SecretStorage` and uses it as the Bearer token for all API calls.
