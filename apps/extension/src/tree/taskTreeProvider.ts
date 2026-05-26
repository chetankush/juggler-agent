/**
 * taskTreeProvider.ts — VS Code TreeDataProvider for the AI Sync Copilot sidebar.
 *
 * Tree structure:
 *   Active (count)
 *     ├─ 🔴 Fix auth refresh issue    before deployment
 *     └─ 🟡 Add rate limit to /login  Fri
 *   Blocked (count)
 *     └─ ...
 *   Completed (count)
 *     └─ ...
 *
 * Priority colors:
 *   high   → ThemeIcon with errorForeground (red)
 *   medium → ThemeIcon with warningForeground (yellow)
 *   low    → ThemeIcon with default
 *
 * contextValue "taskItem" is used by `when` clauses in menus.
 */

import * as vscode from "vscode";
import type { Task, GroupedTasks, Priority } from "@aicrm/shared";

// ---------------------------------------------------------------------------
// Tree item types
// ---------------------------------------------------------------------------

/** A parent node: Active / Blocked / Completed */
export class GroupNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly tasks: Task[],
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.description = `${tasks.length}`;
    this.contextValue = "groupNode";
  }
}

/** A leaf node representing a single task. */
export class TaskTreeItem extends vscode.TreeItem {
  constructor(public readonly task: Task) {
    super(task.title, vscode.TreeItemCollapsibleState.None);

    // Mono deadline shown as the greyed-out description to the right
    this.description = task.deadline ?? "";

    // Tooltip shows the full summary/description
    this.tooltip = new vscode.MarkdownString(
      [
        `**${task.title}**`,
        task.description ? `\n\n${task.description}` : "",
        task.deadline ? `\n\n_Deadline: ${task.deadline}_` : "",
        `\n\n_Status: ${task.status} · Priority: ${task.priority}_`,
      ].join("")
    );

    // Priority-colored icon
    this.iconPath = priorityIcon(task.priority);

    // Context value drives the `when` clause in menus (view/item/context)
    this.contextValue = "taskItem";

    // Clicking the item will run the explainTask command
    this.command = {
      command: "aicrm.explainTask",
      title: "Explain Task",
      arguments: [this],
    };
  }
}

/** Union of all tree node types. */
export type TaskTreeNode = GroupNode | TaskTreeItem;

// ---------------------------------------------------------------------------
// Priority icon helper
// ---------------------------------------------------------------------------

function priorityIcon(priority: Priority): vscode.ThemeIcon {
  switch (priority) {
    case "high":
      return new vscode.ThemeIcon(
        "circle-filled",
        new vscode.ThemeColor("errorForeground")
      );
    case "medium":
      return new vscode.ThemeIcon(
        "circle-filled",
        new vscode.ThemeColor("warningForeground")
      );
    case "low":
    default:
      return new vscode.ThemeIcon(
        "circle-outline",
        new vscode.ThemeColor("descriptionForeground")
      );
  }
}

// ---------------------------------------------------------------------------
// Tree data provider
// ---------------------------------------------------------------------------

export class TaskTreeProvider
  implements vscode.TreeDataProvider<TaskTreeNode>
{
  private _onDidChangeTreeData =
    new vscode.EventEmitter<TaskTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _data: GroupedTasks = { active: [], blocked: [], completed: [] };
  private _loading = false;

  /** Replace the underlying data and signal a full refresh. */
  setData(data: GroupedTasks): void {
    this._data = data;
    this._loading = false;
    this._onDidChangeTreeData.fire();
  }

  /** Show a loading skeleton (empty groups with "loading" description). */
  setLoading(loading: boolean): void {
    this._loading = loading;
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  // ---------------------------------------------------------------------------
  // TreeDataProvider implementation
  // ---------------------------------------------------------------------------

  getTreeItem(element: TaskTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskTreeNode): vscode.ProviderResult<TaskTreeNode[]> {
    if (!element) {
      // Root level: return the three group nodes
      if (this._loading) {
        const loading = new vscode.TreeItem(
          "Loading tasks…",
          vscode.TreeItemCollapsibleState.None
        );
        loading.iconPath = new vscode.ThemeIcon("loading~spin");
        return [loading as unknown as TaskTreeNode];
      }

      const total =
        this._data.active.length +
        this._data.blocked.length +
        this._data.completed.length;

      if (total === 0) {
        const empty = new vscode.TreeItem(
          "No tasks — you're all caught up!",
          vscode.TreeItemCollapsibleState.None
        );
        empty.iconPath = new vscode.ThemeIcon("check-all");
        return [empty as unknown as TaskTreeNode];
      }

      return [
        new GroupNode(
          "Active",
          this._data.active,
          this._data.active.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed
        ),
        new GroupNode(
          "Blocked",
          this._data.blocked,
          this._data.blocked.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed
        ),
        new GroupNode(
          "Completed",
          this._data.completed,
          // Completed starts collapsed by default to keep the view clean
          vscode.TreeItemCollapsibleState.Collapsed
        ),
      ];
    }

    if (element instanceof GroupNode) {
      return element.tasks.map((task) => new TaskTreeItem(task));
    }

    return [];
  }
}
