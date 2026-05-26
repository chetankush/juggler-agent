/**
 * notifications.ts — Polling-based task notifications for the VS Code extension.
 *
 * Responsibilities:
 *   - Poll the backend on `aicrm.pollIntervalSeconds` (default 30s)
 *   - Show a notification for each newly created task since the last poll
 *   - Surface stale / approaching-deadline reminders from the task data
 *   - Refresh the tree view on each poll cycle
 *   - Throttle: never show more than one reminder per task per session
 *
 * Design principle (UX_FLOWS.md § Flow 6): calm, infrequent, batched.
 */

import * as vscode from "vscode";
import type { Task, GroupedTasks } from "@aicrm/shared";
import { getTasks } from "./api";
import { getToken } from "./auth";
import type { TaskTreeProvider } from "./tree/taskTreeProvider";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Task IDs seen in the current VS Code session — used to detect "new" tasks. */
const _seenTaskIds = new Set<string>();

/** Task IDs for which we already showed a reminder this session. */
const _remindedTaskIds = new Set<string>();

let _pollTimer: ReturnType<typeof setInterval> | undefined;
let _provider: TaskTreeProvider | undefined;
let _latestData: GroupedTasks | undefined;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startPolling(
  provider: TaskTreeProvider,
  disposables: vscode.Disposable[]
): void {
  _provider = provider;

  // Poll immediately, then on interval
  void pollOnce();

  const config = vscode.workspace.getConfiguration("aicrm");
  const intervalSec = Math.max(
    10,
    config.get<number>("pollIntervalSeconds", 30)
  );

  _pollTimer = setInterval(() => void pollOnce(), intervalSec * 1000);

  const disposable = new vscode.Disposable(() => stopPolling());
  disposables.push(disposable);

  // Re-read the interval if config changes
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("aicrm.pollIntervalSeconds")) {
      stopPolling();
      startPolling(provider, disposables);
    }
  });
}

export function stopPolling(): void {
  if (_pollTimer !== undefined) {
    clearInterval(_pollTimer);
    _pollTimer = undefined;
  }
}

/** Manually trigger a poll (called from aicrm.refreshTasks command). */
export async function refreshNow(): Promise<GroupedTasks | undefined> {
  return pollOnce();
}

export function getLatestData(): GroupedTasks | undefined {
  return _latestData;
}

// ---------------------------------------------------------------------------
// Core poll loop
// ---------------------------------------------------------------------------

async function pollOnce(): Promise<GroupedTasks | undefined> {
  const token = await getToken();
  if (!token) {
    // Not signed in — skip silently
    return undefined;
  }

  let data: GroupedTasks;
  try {
    data = await getTasks();
  } catch (err) {
    // Network / server error — log but don't spam the user
    console.error("[aicrm] Poll failed:", err);
    return undefined;
  }

  _latestData = data;

  // Update the tree provider
  if (_provider) {
    _provider.setData(data);
  }

  // Detect new tasks and surface reminders
  const allTasks = [...data.active, ...data.blocked, ...data.completed];

  const newTasks: Task[] = [];
  for (const task of allTasks) {
    if (!_seenTaskIds.has(task.id)) {
      // First time we've seen this task in this session
      if (_seenTaskIds.size > 0) {
        // Only notify if this isn't the very first load (avoid notification flood on startup)
        newTasks.push(task);
      }
      _seenTaskIds.add(task.id);
    }
  }

  // Show new-task notifications (batched if multiple)
  if (newTasks.length === 1 && newTasks[0]) {
    const task = newTasks[0];
    const choice = await vscode.window.showInformationMessage(
      `New task: ${task.title}`,
      "Explain Task"
    );
    if (choice === "Explain Task") {
      await vscode.commands.executeCommand("aicrm.explainTask", { task });
    }
  } else if (newTasks.length > 1) {
    vscode.window.showInformationMessage(
      `${newTasks.length} new tasks assigned to you.`,
      "View Tasks"
    );
  }

  // Deadline / stale reminders for active tasks (throttled)
  checkReminders(data.active);

  return data;
}

// ---------------------------------------------------------------------------
// Reminder logic
// ---------------------------------------------------------------------------

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 2 * ONE_DAY_MS; // 48 h without update → stale

function checkReminders(activeTasks: Task[]): void {
  const now = Date.now();
  const highPriorityStale: Task[] = [];
  const approachingDeadlines: Task[] = [];

  for (const task of activeTasks) {
    if (_remindedTaskIds.has(task.id)) continue;

    // Stale: updatedAt > STALE_THRESHOLD_MS ago and priority = high
    const updatedAt = new Date(task.updatedAt).getTime();
    const isStale = now - updatedAt > STALE_THRESHOLD_MS;
    if (isStale && task.priority === "high") {
      highPriorityStale.push(task);
    }

    // Approaching deadline: deadline is a date string within 24 h
    if (task.deadline) {
      const deadlineMs = tryParseDeadline(task.deadline);
      if (
        deadlineMs !== null &&
        deadlineMs > now &&
        deadlineMs - now < ONE_DAY_MS
      ) {
        approachingDeadlines.push(task);
      }
    }
  }

  // Batch stale reminders
  if (highPriorityStale.length > 0) {
    const titles = highPriorityStale.map((t) => `"${t.title}"`).join(", ");
    vscode.window.showWarningMessage(
      `AI Sync Copilot: High-priority task${highPriorityStale.length > 1 ? "s" : ""} still pending: ${titles}.`
    );
    highPriorityStale.forEach((t) => _remindedTaskIds.add(t.id));
  }

  // Deadline reminders (one at a time to keep things calm)
  for (const task of approachingDeadlines) {
    vscode.window.showWarningMessage(
      `Deadline approaching: "${task.title}" — ${task.deadline}.`
    );
    _remindedTaskIds.add(task.id);
    break; // Only one deadline reminder per poll cycle
  }
}

/**
 * Try to parse a deadline string as a Date timestamp.
 * Returns null if it's a natural-language phrase ("before deployment") that
 * can't be parsed as a date.
 */
function tryParseDeadline(deadline: string): number | null {
  const parsed = Date.parse(deadline);
  if (isNaN(parsed)) return null;
  return parsed;
}
