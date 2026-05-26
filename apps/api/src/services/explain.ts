/**
 * Explain Task service (RAG-powered).
 *
 * 1. Embeds the task text.
 * 2. Retrieves the top RAG_TOP_K most relevant repo chunks from pgvector.
 * 3. Sends task + chunks to the AI and returns a TaskExplanation.
 *
 * The AI ONLY SUGGESTS — it never writes or modifies files.
 */
import { eq, sql } from "drizzle-orm";
import {
  RAG_TOP_K,
  taskExplanationSchema,
  type Task,
  type TaskExplanation,
} from "@aicrm/shared";
import { db } from "../db/client.js";
import { repoEmbeddings, workspaces } from "../db/schema.js";
import { embed, chatJSON } from "../lib/openrouter.js";

const SYSTEM_PROMPT = `
You are a code-context assistant helping a developer understand a task.
You have been given:
1. A task description.
2. Relevant source-code chunks retrieved from the developer's repository (RAG).

Your job is to explain what is likely going wrong and how to approach it.

IMPORTANT: You are an advisor only. You MUST NOT write, generate, or modify any code or files.
Your response must be a JSON object matching:
{
  "likelyIssue": string,       // one paragraph explaining the probable root cause
  "relevantFiles": string[],   // file paths from the provided chunks most relevant to this task
  "suggestedApproach": string  // step-by-step guidance (plain text, no code blocks)
}
`.trim();

/**
 * Explain a task using repo context retrieved from pgvector.
 *
 * @param task         The task to explain (from the tasks table).
 * @param workspaceId  Used to scope the vector search to this workspace's repo.
 * @returns            TaskExplanation (AI suggestions only — no code written).
 */
export async function explainTask(
  task: Task,
  workspaceId: string
): Promise<TaskExplanation> {
  // Build a search query from the task title + description.
  const searchText = [task.title, task.description].filter(Boolean).join(" ");

  // 1. Embed the task text.
  const [queryEmbedding] = await embed([searchText]);
  if (!queryEmbedding) {
    throw new Error("Embedding returned an empty result.");
  }

  // 2. Query pgvector by cosine distance (<=>).
  //    Returns the closest RAG_TOP_K chunks in this workspace.
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;
  const chunks = await db
    .select({
      filePath: repoEmbeddings.filePath,
      chunkText: repoEmbeddings.chunkText,
      distance: sql<number>`${repoEmbeddings.embedding} <=> ${embeddingLiteral}::vector`,
    })
    .from(repoEmbeddings)
    .where(eq(repoEmbeddings.workspaceId, workspaceId))
    .orderBy(sql`${repoEmbeddings.embedding} <=> ${embeddingLiteral}::vector`)
    .limit(RAG_TOP_K);

  // 3. Format context for the AI.
  const contextBlocks = chunks
    .map(
      (c, i) =>
        `// --- Chunk ${i + 1}: ${c.filePath} ---\n${c.chunkText}`
    )
    .join("\n\n");

  const userPrompt = `
TASK:
Title: ${task.title}
Priority: ${task.priority}
Deadline: ${task.deadline ?? "none"}
Description: ${task.description ?? "(no description)"}

REPO CONTEXT (${chunks.length} chunks):
${contextBlocks || "(no relevant chunks found)"}
`.trim();

  // 4. Use the workspace's configured model (Settings → AI Model), if any.
  const [ws] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const model = ws?.settings?.defaultModel;

  // 5. Call the AI (returns only suggestions — never writes files).
  return chatJSON(SYSTEM_PROMPT, userPrompt, taskExplanationSchema, model);
}
