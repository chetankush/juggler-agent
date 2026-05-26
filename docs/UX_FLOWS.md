# UX Flows

Companion to [USER_STORIES.md](USER_STORIES.md). Describes the concrete journeys, screens, and states. Design principles: **speed, simplicity, low friction, clean notifications.**

---

## Flow 0 — The golden path (the one that must be beautiful)

```
Manager @mentions dev in Discord
        │
        ▼
AI extracts task ──────────────► task stored
        │                              │
        ▼                              ▼
Discord: lightweight ✅ confirm   VS Code: 🔔 "New task: Fix auth refresh"
        │
        ▼
Dev opens sidebar → clicks task → "Explain Task"
        │
        ▼
AI: likely issue + relevant files (from repo RAG)
        │
        ▼
Dev works… AI reminds if it goes stale
        │
        ▼
End of day → AI asks "what did you finish?" → standup generated
```

Every other flow exists to support this one.

---

## Flow 1 — Owner onboarding (web app)

1. **Login** (`/login`) — Supabase Auth (email/OAuth).
2. **Onboarding** (`/onboarding`) — create workspace (name). First-run only.
3. **Integrations** (`/integrations`) — "Connect Discord" → OAuth/bot invite → pick server + channel(s) to watch.
4. **Settings** (`/settings`) — reminder cadence, working hours, default model.
5. Success state → "You're set. Open the VS Code extension to see tasks."

**Empty states:** no workspace → onboarding; Discord not connected → prominent "Connect Discord" card on dashboard.

---

## Flow 2 — Developer sign-in (VS Code extension)

1. Install extension → activity bar icon appears.
2. Sidebar shows "Sign in" CTA.
3. Click → opens browser → Supabase auth → redirect deep-links JWT back to the extension.
4. On success: sidebar swaps to the task list. Token stored in VS Code `SecretStorage`.
5. Link Discord identity if not already linked (one-time prompt).

**Error states:** token expired → silent refresh, else re-prompt sign-in. Offline → show cached tasks with an "offline" badge.

---

## Flow 3 — Capture (Discord → task)

1. Manager: `@Chetan fix auth refresh issue before deployment`.
2. Bot detects the mention (and reads the thread for context).
3. AI extraction returns structured JSON (title / priority / deadline / summary).
4. Task created, assigned to the mentioned dev, `source_message` saved.
5. Bot reacts with ✅ (or a short reply) so the manager sees it landed.

**Edge cases:**
- Mention with no actionable content → no task, optional 🤔 reaction.
- Multiple mentions → one task per assignee, or a clarifying reply.
- Ambiguous deadline → store the natural-language phrase as-is ("before deployment").

---

## Flow 4 — Task sidebar (VS Code)

**Layout:** tree view grouped by status.

```
AI SYNC COPILOT
├─ ▼ Active (2)
│   ├─ 🔴 Fix auth refresh issue        before deployment
│   └─ 🟡 Add rate limit to /login      Fri
├─ ▼ Blocked (1)
│   └─ ⚪ Migrate to new logger          waiting on infra
└─ ▶ Completed (5)
```

- **Priority dot:** 🔴 high / 🟡 medium / ⚪ low.
- **Click a task** → detail webview: title, summary, original message, assignee, deadline, status dropdown, "Explain Task" button.
- **Inline actions** (hover): mark complete, mark blocked, snooze.
- **Refresh:** WS push when available, polling fallback.

**States:** loading skeleton, empty ("No tasks — you're all caught up 🎉"), error (retry).

---

## Flow 5 — Explain Task (repo RAG)

1. Dev clicks **Explain Task** on a task.
2. Extension embeds the task text → searches local `repo_embeddings` (pgvector) → top-k relevant chunks.
3. Sends task + only those chunks to OpenRouter.
4. Renders in the detail webview:
   - **Likely issue** — what's probably going on.
   - **Relevant files** — clickable paths that open in the editor.
   - **Suggested approach** — steps (suggestion only).
5. Footer note: *"AI suggestion — review before acting."*

**Guardrails:** never writes to disk; never auto-runs commands. Clear loading + "regenerate" affordance.

---

## Flow 6 — Reminders

Channels: VS Code notification + Discord DM/message.

| Trigger | Example |
|---------|---------|
| Inactive task | "You still have 2 pending high-priority tasks." |
| Approaching deadline | "Auth refresh task is due before deployment — still active." |
| Stale work | "No progress detected on the auth retry task." |

**Principles:** batch where possible, respect working hours, never spam. Each reminder links straight to the task. Dev can snooze or mark done from the notification.

---

## Flow 7 — End-of-day standup

1. At end of working hours, AI asks (Discord/extension): "What tasks did you complete today?"
2. Dev confirms/edits the auto-detected completed list.
3. AI generates:
   - **Done** — completed today
   - **Pending** — still active
   - **Blockers** — blocked tasks + reason
4. One click to post to the team Discord channel.

**Low-friction default:** if the dev ignores the prompt, generate the summary from task state anyway and offer it the next morning.

---

## Cross-cutting UX rules

- **Notifications are calm:** grouped, throttled, working-hours aware.
- **Two clicks max** to go from "notified" to "understanding the task."
- **AI is always labeled** as a suggestion; the dev is the decision-maker.
- **Fast first paint:** cached tasks render instantly; freshness updates in the background.
- **Privacy:** repo content used for RAG stays scoped to the workspace; excluded paths never leave the machine for indexing.
