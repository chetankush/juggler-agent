/**
 * extension.ts — VS Code extension entry point for AI Sync Copilot.
 *
 * activate():
 *   1. Initialise auth module (SecretStorage)
 *   2. Register the TaskTreeProvider + tree view
 *   3. Register the URI handler for auth deep-links (vscode://aicrm.extension/auth)
 *   4. Register all commands (signIn/Out, refreshTasks, explainTask, mark*, snooze, indexRepo)
 *   5. Start polling (task notifications + tree refresh)
 *
 * deactivate(): polling is stopped via disposables.
 */

import * as vscode from "vscode";
import { initAuth, signIn, signOut, getToken, AuthUriHandler } from "./auth";
import { getTasks, updateTask, explainTask } from "./api";
import { TaskTreeProvider, TaskTreeItem } from "./tree/taskTreeProvider";
import { openExplainPanel } from "./webview/explainPanel";
import { startPolling, refreshNow } from "./notifications";
import { indexRepository } from "./repo/scanner";
import type { Task } from "@aicrm/shared";

// ---------------------------------------------------------------------------
// Activate
// ---------------------------------------------------------------------------

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // 1. Auth
  initAuth(context);

  // Set initial context key so `when` clauses work on startup
  const initialToken = await getToken();
  await vscode.commands.executeCommand(
    "setContext",
    "aicrm.isSignedIn",
    Boolean(initialToken)
  );

  // 2. Tree provider + view
  const treeProvider = new TaskTreeProvider();

  const treeView = vscode.window.createTreeView("aicrm.tasks", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);

  // If already signed in, do an immediate load
  if (initialToken) {
    treeProvider.setLoading(true);
    void getTasks()
      .then((data) => treeProvider.setData(data))
      .catch(() => treeProvider.setLoading(false));
  }

  // 3. URI handler for auth callback
  const uriHandler = new AuthUriHandler();
  context.subscriptions.push(
    vscode.window.registerUriHandler(uriHandler)
  );

  // 4. Commands
  registerCommands(context, treeProvider);

  // 5. Polling (also refreshes the tree)
  startPolling(treeProvider, context.subscriptions);
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

function registerCommands(
  context: vscode.ExtensionContext,
  treeProvider: TaskTreeProvider
): void {
  // -- aicrm.signIn ----------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("aicrm.signIn", async () => {
      await signIn();
    })
  );

  // -- aicrm.signOut ---------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("aicrm.signOut", async () => {
      await signOut();
      // Clear the tree after sign-out
      treeProvider.setData({ active: [], blocked: [], completed: [] });
    })
  );

  // -- aicrm.refreshTasks ----------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("aicrm.refreshTasks", async () => {
      const token = await getToken();
      if (!token) {
        vscode.window.showWarningMessage(
          "AI Sync Copilot: Sign in first to refresh tasks."
        );
        return;
      }
      treeProvider.setLoading(true);
      await refreshNow();
    })
  );

  // -- aicrm.explainTask -----------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aicrm.explainTask",
      async (arg: TaskTreeItem | { task: Task } | undefined) => {
        const task = resolveTask(arg);
        if (!task) {
          vscode.window.showWarningMessage(
            "AI Sync Copilot: Select a task in the sidebar to explain."
          );
          return;
        }

        const explanationPromise = explainTask(task.id);
        openExplainPanel(task, explanationPromise, context.extensionUri);
      }
    )
  );

  // -- aicrm.markComplete ----------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aicrm.markComplete",
      async (arg: TaskTreeItem | undefined) => {
        const task = resolveTask(arg);
        if (!task) return;
        try {
          await updateTask(task.id, { status: "completed" });
          await refreshNow();
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to mark task complete: ${errorMessage(err)}`
          );
        }
      }
    )
  );

  // -- aicrm.markBlocked -----------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aicrm.markBlocked",
      async (arg: TaskTreeItem | undefined) => {
        const task = resolveTask(arg);
        if (!task) return;
        try {
          await updateTask(task.id, { status: "blocked" });
          await refreshNow();
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to mark task blocked: ${errorMessage(err)}`
          );
        }
      }
    )
  );

  // -- aicrm.snoozeTask ------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aicrm.snoozeTask",
      async (arg: TaskTreeItem | undefined) => {
        const task = resolveTask(arg);
        if (!task) return;

        // For MVP: snooze = defer the reminder by resetting updatedAt on the server.
        // We use a PATCH with the same status to bump updatedAt.
        try {
          await updateTask(task.id, { status: task.status });
          vscode.window.showInformationMessage(
            `Snoozed: "${task.title}". You won't be reminded again until tomorrow.`
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to snooze task: ${errorMessage(err)}`
          );
        }
      }
    )
  );

  // -- aicrm.indexRepo -------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand("aicrm.indexRepo", async () => {
      const token = await getToken();
      if (!token) {
        vscode.window.showWarningMessage(
          "AI Sync Copilot: Sign in before indexing the repository."
        );
        return;
      }

      // The workspace ID would normally come from the user's JWT / API profile.
      // For MVP, prompt for it (in a real build this would be fetched from /me).
      const workspaceId = await vscode.window.showInputBox({
        prompt: "Enter your Workspace ID (from the web app settings)",
        placeHolder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        validateInput: (v) =>
          /^[0-9a-f-]{36}$/i.test(v)
            ? undefined
            : "Must be a valid UUID",
      });

      if (!workspaceId) return;
      await indexRepository(workspaceId);
    })
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the `task` from various argument shapes the command may receive:
 *   - A TaskTreeItem (from context-menu clicks)
 *   - A plain object with a `task` property (from programmatic calls)
 *   - undefined → return undefined
 */
function resolveTask(
  arg: TaskTreeItem | { task: Task } | undefined
): Task | undefined {
  if (!arg) return undefined;
  if (arg instanceof TaskTreeItem) return arg.task;
  if ("task" in arg) return arg.task;
  return undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Deactivate
// ---------------------------------------------------------------------------

export function deactivate(): void {
  // Disposables registered via context.subscriptions are cleaned up automatically.
  // stopPolling() is called via the Disposable registered in startPolling().
}
