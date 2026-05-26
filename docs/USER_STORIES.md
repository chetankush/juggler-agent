# User Stories

Format: **As a** \<role\>, **I want** \<capability\>, **so that** \<outcome\>.

## Personas

- **Manager / Team Lead** — assigns work in Discord, wants visibility that it's been received and is progressing.
- **Developer** — does the work in VS Code, wants to never lose track of what's assigned and understand it fast.
- **Workspace Owner** — sets up the workspace, connects Discord, invites the team.

> MVP centers on the **Developer**. The Manager and Owner stories exist to make the Developer loop work.

---

## Epic 1 — Onboarding & connection

- **US-1.1** As an **owner**, I want to sign up and create a workspace, so that my team has a shared space for tasks.
- **US-1.2** As an **owner**, I want to connect my Discord server/channel, so that mentions there become tasks.
- **US-1.3** As a **developer**, I want to sign in from the VS Code extension, so that my tasks show up where I code.
- **US-1.4** As a **developer**, I want my Discord identity linked to my account, so that mentions of me are assigned to me.

**Acceptance (US-1.2):** after connecting, a mention in the chosen channel creates a task in the workspace within seconds.

---

## Epic 2 — Capture: Discord → task

- **US-2.1** As a **manager**, I want to @mention a developer with a request in Discord, so that it becomes a tracked task without anyone copy-pasting.
- **US-2.2** As a **developer**, I want the AI to extract a clear title, priority, and deadline from a messy message, so that I don't have to interpret it.
- **US-2.3** As a **developer**, I want the original Discord message kept on the task, so that I can see the full context.
- **US-2.4** As a **manager**, I want a lightweight confirmation that the task was captured, so that I trust it landed.

**Acceptance (US-2.2):** given `@Chetan fix auth refresh issue before deployment`, the task has title "Fix auth refresh issue", priority "high", deadline "before deployment", and a one-line summary.

---

## Epic 3 — Visibility: task sidebar

- **US-3.1** As a **developer**, I want a VS Code sidebar listing my active, blocked, and completed tasks, so that I see everything in one place.
- **US-3.2** As a **developer**, I want to mark a task active/blocked/completed, so that status reflects reality.
- **US-3.3** As a **developer**, I want a new-task notification in VS Code, so that I notice work the moment it's assigned.
- **US-3.4** As a **developer**, I want tasks to update in near-real-time, so that the list is never stale.

**Acceptance (US-3.3):** when a task is created in Discord, the developer sees a VS Code notification within the polling/WS interval.

---

## Epic 4 — Understanding: repo-aware explanations

- **US-4.1** As a **developer**, I want to click "Explain Task" and get the likely issue + relevant files, so that I know where to start.
- **US-4.2** As a **developer**, I want explanations grounded in *my* repo, so that suggestions reference real files and functions.
- **US-4.3** As a **developer**, I want the AI to only suggest (not edit code), so that I stay in control.
- **US-4.4** As a **developer**, I want indexing to skip junk (`node_modules`, `dist`, `.env`, etc.), so that context stays relevant and private.

**Acceptance (US-4.1):** the explanation cites at least one real file path from the indexed repo and never writes to disk.

---

## Epic 5 — Follow-through: reminders

- **US-5.1** As a **developer**, I want reminders about pending high-priority tasks, so that I don't forget them.
- **US-5.2** As a **developer**, I want a nudge when a deadline approaches, so that I deliver on time.
- **US-5.3** As a **developer**, I want a stale-work nudge when no progress is detected, so that blocked work surfaces.
- **US-5.4** As a **developer**, I want reminders to be calm and infrequent, so that they help rather than annoy.

**Acceptance (US-5.1):** a reminder fires for tasks left in `active` past their inactivity threshold and links back to the task.

---

## Epic 6 — Alignment: daily summary

- **US-6.1** As a **developer**, I want an end-of-day prompt asking what I completed, so that writing a standup takes seconds.
- **US-6.2** As a **developer**, I want an auto-generated standup (done / pending / blockers), so that I can paste it into Discord.
- **US-6.3** As a **manager**, I want to see what each developer reported, so that I stay aligned without status meetings.

**Acceptance (US-6.2):** the summary lists completed, pending, and blocked tasks pulled from real task state.

---

## Story map (priority order for MVP)

1. US-1.1, US-1.3 (auth in web + extension)
2. US-2.1 → US-2.3 (capture loop)
3. US-3.1, US-3.3 (sidebar + notification)
4. US-4.1, US-4.2 (explain)
5. US-5.1, US-5.2 (reminders)
6. US-6.1, US-6.2 (summary)

This order builds the [core flow](PRODUCT.md#the-most-important-ux-flow) end-to-end before widening.

---

## Epic 7 — Frictionless Discord onboarding (sellable polish)

Removes the only known setup hurdle (privileged Gateway Intent) so the bot works the moment a user invites it. Slash commands don't need the MESSAGE CONTENT intent.

- **US-7.1** As a **developer**, I want to run `/task <description>` in any channel and have it auto-captured, so that I can record work without leaving Discord — **even when MESSAGE CONTENT intent is off.**
- **US-7.2** As a **workspace owner**, I want to run `/link` in the Discord server to bind that guild to my workspace, so that onboarding takes one command instead of the dashboard.
- **US-7.3** As a **developer**, I want to run `/standup` to print today's standup right in chat, so that the team sees status without anyone opening the web app.

**Acceptance (US-7.1):** the bot replies "✅ Task captured: **\<title\>** (\<priority\>)" within 5 s, the task appears on the dashboard, and the invoking user is the assignee if they've linked their Discord ID.
**Acceptance (US-7.2):** `/link` succeeds only for a user who is the workspace owner; subsequent `/task` calls land in that workspace.
**Acceptance (US-7.3):** `/standup` returns the same done/pending/blockers breakdown as the web standup modal.

---

## Epic 8 — Daily rhythm automation

- **US-8.1** As a **developer**, I want the standup to be posted to Discord automatically at the end of my working hours, so that I never forget to share status.
- **US-8.2** As a **manager**, I want it to only fire once per day per workspace, so that the channel stays clean.

**Acceptance (US-8.1):** every workspace with a linked Discord guild and a `workingHoursEnd` setting gets exactly one standup posted that day, the first time the scheduler ticks after the cut-off.
**Acceptance (US-8.2):** persisted `lastStandupAt` prevents repeats even across server restarts.

---

## Updated story map

After US-7 / US-8, the previous gaps in Epic 2 (needs privileged intent) and Epic 6 (no auto-EOD) close to full coverage. Remaining v1.1 candidates: workspace member invites, role-based access, search, and Cmd+K palette.
