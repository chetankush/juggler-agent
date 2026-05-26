/**
 * OpenRouter client helpers.
 *
 * chatJSON — sends a chat completion request and parses the JSON response
 *            against a caller-supplied Zod schema.
 * embed    — returns embeddings for an array of text strings.
 *
 * Both functions throw a descriptive error when OPENROUTER_API_KEY is absent,
 * so the server can start without the key (degraded mode) but will fail clearly
 * when an AI feature is actually invoked.
 */
import { z } from "zod";
import { env } from "./env.js";

const BASE_URL = "https://openrouter.ai/api/v1";

function requireApiKey(): string {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured. Set it in .env to use AI features."
    );
  }
  return env.OPENROUTER_API_KEY;
}

function headers(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    // OpenRouter recommends these for routing transparency.
    "HTTP-Referer": "https://aicrm.internal",
    "X-Title": "AI Sync Copilot",
  };
}

/**
 * Sends a chat completion to OpenRouter and parses the JSON response.
 *
 * @param systemPrompt  Instruction for the model.
 * @param userPrompt    The user / task content.
 * @param schema        Zod schema to parse and validate the model's JSON output.
 * @returns             Validated, typed result.
 */
export async function chatJSON<S extends z.ZodTypeAny>(
  systemPrompt: string,
  userPrompt: string,
  schema: S,
  model?: string
): Promise<z.infer<S>> {
  const apiKey = requireApiKey();

  const body = {
    model: model ?? env.OPENROUTER_CHAT_MODEL,
    messages: [
      {
        role: "system",
        content:
          systemPrompt +
          "\n\nYou MUST respond with valid JSON only. No markdown fences, no prose.",
      },
      { role: "user", content: userPrompt },
    ],
    // Ask the model to emit JSON so most providers honour it.
    response_format: { type: "json_object" },
  };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter chat error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = json.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenRouter returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Model did not return valid JSON. Got: ${raw}`);
  }

  return schema.parse(parsed);
}

/**
 * Returns embeddings for an array of texts.
 *
 * @param texts   One or more strings to embed.
 * @returns       Array of embedding vectors (number[][]).
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const apiKey = requireApiKey();

  const body = {
    model: env.OPENROUTER_EMBEDDING_MODEL,
    input: texts,
  };

  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter embeddings error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return json.data.map((d) => d.embedding);
}
