# AI Sync Copilot — VS Code Extension

Task visibility and repo-aware explanations for developers, powered by AI Sync Copilot.

## What it does

- **Task sidebar** — shows your Active, Blocked, and Completed tasks, synced from Discord mentions via the backend.
- **Explain Task** — click any task to get an AI-powered explanation: likely issue, relevant files from your repo, and a suggested approach. The AI only suggests; it never edits your code.
- **Repo indexing** — indexes your local codebase so explanations are grounded in real files and functions.
- **Notifications** — calm, throttled alerts for new tasks, approaching deadlines, and stale work.

## Getting started

### Prerequisites

- The AI Sync Copilot backend (`apps/api`) must be running.
- A workspace must be created in the web app (`apps/web`).

### Setup

1. Press **F5** in VS Code to open the Extension Development Host.
2. Open **Settings** (`Cmd/Ctrl + ,`) and search for `aicrm`:
   - Set `aicrm.apiBaseUrl` to your backend URL (default: `http://localhost:3001`).
   - Optionally adjust `aicrm.pollIntervalSeconds` (default: 30).
3. Click the **AI Sync Copilot** icon in the activity bar.
4. Click **Sign In** — your browser opens the web app login page.
5. After authenticating, the browser redirects back to VS Code and your tasks appear.
6. (Optional) Run **AI Sync Copilot: Index Repository** from the Command Palette (`Cmd/Ctrl + Shift + P`) to enable RAG-powered explanations.

## Commands

| Command | Description |
|---------|-------------|
| `AI Sync Copilot: Sign In` | Open browser to authenticate |
| `AI Sync Copilot: Sign Out` | Clear stored token |
| `AI Sync Copilot: Index Repository` | Scan and upload repo chunks for RAG |
| Refresh (toolbar icon) | Manually refresh the task list |
| Explain Task (context menu) | Open the AI explanation panel |
| Mark Complete (context menu) | Set task status to completed |
| Mark Blocked (context menu) | Set task status to blocked |
| Snooze Task (context menu) | Defer the next reminder |

## Building

```sh
pnpm --filter @aicrm/extension build   # one-shot build
pnpm --filter @aicrm/extension watch   # watch mode
pnpm --filter @aicrm/extension typecheck
```

## Architecture

- `src/extension.ts` — entry point, command registration, polling lifecycle
- `src/auth.ts` — JWT storage via `SecretStorage`, URI handler for auth callback
- `src/api.ts` — typed HTTP client (global `fetch` + Bearer token)
- `src/tree/taskTreeProvider.ts` — `TreeDataProvider` grouping tasks by status
- `src/webview/explainPanel.ts` — theme-adaptive webview for task explanations
- `src/repo/scanner.ts` — repo walker + chunker + upload
- `src/notifications.ts` — poll loop, new-task alerts, deadline reminders

The AI **only suggests** — it never writes to disk or executes commands.
