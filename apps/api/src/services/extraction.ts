/**
 * AI Task Extraction service.
 *
 * Converts a raw Discord mention string into a structured TaskExtraction object
 * using OpenRouter (Gemini Flash by default).
 *
 * Example input : "@Chetan fix auth refresh issue before deployment"
 * Example output: { title: "Fix auth refresh issue", priority: "high",
 *                   deadline: "before deployment", summary: "Fix JWT refresh logic" }
 */
import { taskExtractionSchema, type TaskExtraction } from "@aicrm/shared";
import { chatJSON } from "../lib/openrouter.js";

const SYSTEM_PROMPT = `
You are a task extraction assistant for a developer team.
Given a raw Discord message (which may be a mention or thread reply), extract a structured task.

Rules:
- "title": a short, imperative title (verb + object). Max 80 characters.
- "priority": "low" | "medium" | "high". Infer from urgency cues ("asap", "critical", "before deployment" → high; "when you can" → low; default → medium).
- "deadline": natural-language deadline string if one is present ("before deployment", "by Friday"), otherwise null.
- "summary": one concise sentence describing what needs to be done and why.

Respond with a single JSON object matching exactly:
{
  "title": string,
  "priority": "low" | "medium" | "high",
  "deadline": string | null,
  "summary": string
}
`.trim();

/**
 * Extract a structured task from a raw Discord message.
 *
 * @param message  Raw Discord message text (may include @mention).
 * @returns        Validated TaskExtraction object.
 */
export async function extractTask(message: string): Promise<TaskExtraction> {
  return chatJSON(SYSTEM_PROMPT, message, taskExtractionSchema);
}
