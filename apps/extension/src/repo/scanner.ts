/**
 * scanner.ts — Repo scanner and chunker for the AI Sync Copilot extension.
 *
 * Triggered by the `aicrm.indexRepo` command.
 *
 * Steps:
 *   1. Walk the open workspace folder (recursive)
 *   2. Skip REPO_EXCLUDE_DIRS and REPO_EXCLUDE_FILES
 *   3. Include only REPO_INDEX_EXTENSIONS
 *   4. Chunk each file by function/class/module boundaries (heuristic for MVP)
 *   5. POST chunks in batches to the backend /embeddings endpoint
 *
 * Privacy: repo content is scoped to the workspace; excluded paths never leave
 * the machine. Source: docs/ARCHITECTURE.md § Repo context + RAG (extension).
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  REPO_EXCLUDE_DIRS,
  REPO_EXCLUDE_FILES,
  REPO_INDEX_EXTENSIONS,
} from "@aicrm/shared";
import type { RepoChunk } from "@aicrm/shared";
import { postChunks } from "../api";

const BATCH_SIZE = 50; // chunks per POST request
const MAX_CHUNK_CHARS = 4_000; // safety ceiling — keep chunks under token limits

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function indexRepository(workspaceId: string): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(
      "AI Sync Copilot: No workspace folder is open. Open a project first."
    );
    return;
  }

  const folder = workspaceFolders[0];
  if (!folder) return;
  const rootPath = folder.uri.fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AI Sync Copilot: Indexing repository…",
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: "Scanning files…", increment: 0 });

      const files = collectFiles(rootPath, token);

      if (token.isCancellationRequested) {
        return;
      }

      progress.report({
        message: `Found ${files.length} files. Chunking…`,
        increment: 10,
      });

      const allChunks: RepoChunk[] = [];
      for (const filePath of files) {
        if (token.isCancellationRequested) break;
        const relative = path.relative(rootPath, filePath).replace(/\\/g, "/");
        const chunks = chunkFile(filePath, relative, workspaceId);
        allChunks.push(...chunks);
      }

      if (token.isCancellationRequested) {
        vscode.window.showInformationMessage(
          "AI Sync Copilot: Indexing cancelled."
        );
        return;
      }

      progress.report({
        message: `Uploading ${allChunks.length} chunks…`,
        increment: 20,
      });

      const batches = splitBatches(allChunks, BATCH_SIZE);
      const increment = batches.length > 0 ? 70 / batches.length : 70;

      for (let i = 0; i < batches.length; i++) {
        if (token.isCancellationRequested) break;
        const batch = batches[i];
        if (!batch || batch.length === 0) continue;
        try {
          await postChunks(batch);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `AI Sync Copilot: Failed to upload batch ${i + 1}: ${msg}`
          );
          return;
        }
        progress.report({
          message: `Uploaded batch ${i + 1}/${batches.length}…`,
          increment,
        });
      }

      if (!token.isCancellationRequested) {
        vscode.window.showInformationMessage(
          `AI Sync Copilot: Indexed ${allChunks.length} chunks from ${files.length} files.`
        );
      }
    }
  );
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

const EXCLUDE_DIRS_SET = new Set<string>(REPO_EXCLUDE_DIRS);
const EXCLUDE_FILES_SET = new Set<string>(REPO_EXCLUDE_FILES);
const INCLUDE_EXTS_SET = new Set<string>(REPO_INDEX_EXTENSIONS);

function collectFiles(
  dir: string,
  token: vscode.CancellationToken
): string[] {
  const results: string[] = [];
  _walk(dir, results, token);
  return results;
}

function _walk(
  dir: string,
  results: string[],
  token: vscode.CancellationToken
): void {
  if (token.isCancellationRequested) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Skip unreadable directories
  }

  for (const entry of entries) {
    if (token.isCancellationRequested) return;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS_SET.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue; // skip hidden dirs
      _walk(fullPath, results, token);
    } else if (entry.isFile()) {
      if (EXCLUDE_FILES_SET.has(entry.name)) continue;
      const ext = path.extname(entry.name);
      if (!INCLUDE_EXTS_SET.has(ext)) continue;
      results.push(fullPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Chunking heuristic
// ---------------------------------------------------------------------------

/**
 * Chunk a file by top-level function/class/module declarations.
 * For MVP: splits on blank-line-separated "top-level blocks" that start with
 * common declaration keywords. Falls back to fixed-size character windows.
 */
function chunkFile(
  filePath: string,
  relativePath: string,
  workspaceId: string
): RepoChunk[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  if (!content.trim()) return [];

  const rawChunks = splitIntoChunks(content, relativePath);
  return rawChunks.map((chunkText) => ({
    workspaceId,
    filePath: relativePath,
    chunkText,
  }));
}

/**
 * Heuristic splitter:
 * 1. Try to split by top-level declarations (function/class/export/const/interface/type at column 0)
 * 2. If any chunk is too large, sub-split by blank-line paragraphs
 * 3. Hard cap at MAX_CHUNK_CHARS
 */
function splitIntoChunks(content: string, _filePath: string): string[] {
  const lines = content.split("\n");

  // Regex for lines that start a new top-level declaration at column 0
  const DECL_RE =
    /^(export\s+)?(async\s+)?(function|class|const|let|var|interface|type|enum|abstract\s+class)\s/;

  const chunks: string[] = [];
  let currentLines: string[] = [];

  for (const line of lines) {
    if (DECL_RE.test(line) && currentLines.length > 0) {
      // Flush the previous chunk
      const text = currentLines.join("\n").trim();
      if (text) pushChunks(chunks, text);
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // Flush the last chunk
  const tail = currentLines.join("\n").trim();
  if (tail) pushChunks(chunks, tail);

  // If we got only one giant chunk (no declarations found), fall back to paragraph splitting
  if (chunks.length <= 1) {
    const paragraphs = content.split(/\n{2,}/);
    const result: string[] = [];
    for (const p of paragraphs) {
      pushChunks(result, p.trim());
    }
    return result.filter((c) => c.length > 0);
  }

  return chunks;
}

/** Push text as one or more chunks, splitting at MAX_CHUNK_CHARS if needed. */
function pushChunks(out: string[], text: string): void {
  if (text.length <= MAX_CHUNK_CHARS) {
    if (text.trim()) out.push(text);
    return;
  }
  // Hard split by character limit, preferring newline boundaries
  let remaining = text;
  while (remaining.length > MAX_CHUNK_CHARS) {
    // Find the last newline within the limit
    let splitAt = remaining.lastIndexOf("\n", MAX_CHUNK_CHARS);
    if (splitAt <= 0) splitAt = MAX_CHUNK_CHARS;
    out.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) out.push(remaining);
}

function splitBatches<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
