/**
 * explainPanel.ts — "Explain Task" webview panel.
 *
 * Renders a TaskExplanation in a VS Code webview that:
 *   - Adapts to any VS Code theme via CSS custom properties (var(--vscode-*))
 *   - Uses a CSP nonce on all inline scripts (no eval, no remote scripts)
 *   - Shows: Likely Issue, Relevant Files (clickable → open in editor), Suggested Approach
 *   - Always displays a muted footer: "AI suggestion — review before acting."
 *   - Handles file-open messages sent from the webview script
 *
 * Design System references (DESIGN_SYSTEM.md § Extension theming):
 *   bg    → var(--vscode-editor-background)
 *   text  → var(--vscode-foreground)
 *   links → var(--vscode-textLink-foreground)
 *   border→ var(--vscode-panel-border)
 *   btns  → var(--vscode-button-background) / var(--vscode-button-foreground)
 */

import * as vscode from "vscode";
import * as crypto from "crypto";
import type { Task, TaskExplanation } from "@aicrm/shared";

/** Map from task id → active panel so we don't open duplicates. */
const _panels = new Map<string, vscode.WebviewPanel>();

/**
 * Open (or reveal) the Explain Task panel for a task.
 * Shows a loading state, then populates with the explanation once resolved.
 */
export function openExplainPanel(
  task: Task,
  explanationPromise: Promise<TaskExplanation>,
  extensionUri: vscode.Uri
): void {
  const existing = _panels.get(task.id);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Beside, /* preserveFocus */ true);
    // Still update with a fresh explanation
    void updatePanel(existing, task, explanationPromise);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "aicrm.explainTask",
    `Explain: ${task.title}`,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri],
    }
  );

  _panels.set(task.id, panel);

  panel.onDidDispose(() => {
    _panels.delete(task.id);
  });

  // Handle messages from the webview (file-open clicks)
  panel.webview.onDidReceiveMessage(async (message: { type: string; filePath?: string }) => {
    if (message.type === "openFile" && message.filePath) {
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showWarningMessage("No workspace folder open.");
          return;
        }
        const folder = workspaceFolders[0];
        if (!folder) return;
        const fileUri = vscode.Uri.joinPath(folder.uri, message.filePath);
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      } catch {
        vscode.window.showErrorMessage(
          `Could not open file: ${message.filePath}`
        );
      }
    }
  });

  // Render loading state immediately
  panel.webview.html = buildHtml(panel.webview, task, null);

  void updatePanel(panel, task, explanationPromise);
}

async function updatePanel(
  panel: vscode.WebviewPanel,
  task: Task,
  explanationPromise: Promise<TaskExplanation>
): Promise<void> {
  try {
    const explanation = await explanationPromise;
    if (!panel.visible) return; // panel was closed while we were waiting
    panel.webview.html = buildHtml(panel.webview, task, explanation);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    panel.webview.html = buildHtml(panel.webview, task, null, message);
  }
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildHtml(
  webview: vscode.Webview,
  task: Task,
  explanation: TaskExplanation | null,
  error?: string
): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const csp = [
    `default-src 'none'`,
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  const body = error
    ? renderError(error)
    : explanation === null
    ? renderLoading()
    : renderExplanation(explanation);

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Explain: ${escHtml(task.title)}</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      line-height: 1.6;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      padding: 24px;
      max-width: 780px;
    }

    h1 {
      font-size: 1.15em;
      font-weight: 600;
      line-height: 1.3;
      margin-bottom: 4px;
      color: var(--vscode-foreground);
    }

    .task-meta {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 20px;
    }

    .section {
      margin-bottom: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .section:last-of-type {
      border-bottom: none;
    }

    .section-title {
      font-size: 0.75em;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    .section-body {
      font-size: 0.92em;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .file-list {
      list-style: none;
      margin-top: 4px;
    }

    .file-list li {
      margin-bottom: 4px;
    }

    .file-link {
      background: none;
      border: none;
      padding: 2px 0;
      cursor: pointer;
      color: var(--vscode-textLink-foreground);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.88em;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .file-link:hover {
      color: var(--vscode-textLink-activeForeground);
    }

    .file-link:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
      border-radius: 2px;
    }

    .footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
      font-size: 0.8em;
      color: var(--vscode-disabledForeground, var(--vscode-descriptionForeground));
      font-style: italic;
    }

    .loading {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--vscode-descriptionForeground);
      padding: 32px 0;
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid var(--vscode-panel-border);
      border-top-color: var(--vscode-progressBar-background, var(--vscode-textLink-foreground));
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (prefers-reduced-motion: reduce) {
      .spinner { animation: none; opacity: 0.5; }
    }

    .error-box {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground, var(--vscode-foreground));
      border-radius: 4px;
      padding: 12px 16px;
      margin: 16px 0;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <h1>${escHtml(task.title)}</h1>
  <div class="task-meta">
    ${task.deadline ? `Deadline: <span style="font-family:var(--vscode-editor-font-family,monospace)">${escHtml(task.deadline)}</span> &nbsp;·&nbsp; ` : ""}
    Priority: ${escHtml(task.priority)} &nbsp;·&nbsp; Status: ${escHtml(task.status)}
  </div>

  ${body}

  <div class="footer" role="note" aria-live="polite">
    AI suggestion — review before acting.
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('.file-link').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ type: 'openFile', filePath: btn.dataset.path });
      });
    });
  </script>
</body>
</html>`;
}

function renderLoading(): string {
  return `<div class="loading" aria-live="polite" aria-label="Loading explanation">
    <div class="spinner" aria-hidden="true"></div>
    <span>Generating explanation…</span>
  </div>`;
}

function renderError(message: string): string {
  return `<div class="error-box" role="alert">
    <strong>Could not generate explanation:</strong><br>${escHtml(message)}
  </div>`;
}

function renderExplanation(exp: TaskExplanation): string {
  const filesHtml =
    exp.relevantFiles.length === 0
      ? `<p class="section-body" style="color:var(--vscode-descriptionForeground)">No specific files identified.</p>`
      : `<ul class="file-list" aria-label="Relevant files">
          ${exp.relevantFiles
            .map(
              (f) =>
                `<li><button class="file-link" data-path="${escAttr(f)}" aria-label="Open ${escAttr(f)}">${escHtml(f)}</button></li>`
            )
            .join("\n          ")}
        </ul>`;

  return `
  <div class="section">
    <div class="section-title">Likely Issue</div>
    <div class="section-body">${escHtml(exp.likelyIssue)}</div>
  </div>

  <div class="section">
    <div class="section-title">Relevant Files</div>
    ${filesHtml}
  </div>

  <div class="section">
    <div class="section-title">Suggested Approach</div>
    <div class="section-body">${escHtml(exp.suggestedApproach)}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// HTML escape helpers
// ---------------------------------------------------------------------------

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(str: string): string {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
