/**
 * BullMQ Embeddings queue + worker.
 *
 * The worker receives repo chunks (from the VS Code extension scanner), calls
 * the OpenRouter embedding API, and upserts the vectors into Supabase pgvector.
 */
import { Queue, Worker, type Job } from "bullmq";
import { QUEUES, type RepoChunk } from "@aicrm/shared";
import { redis } from "../lib/redis.js";
import { db } from "../db/client.js";
import { repoEmbeddings } from "../db/schema.js";
import { embed } from "../lib/openrouter.js";

export type EmbeddingJobData = RepoChunk; // { workspaceId, filePath, chunkText }

// ── Queue ─────────────────────────────────────────────────────────────────────
export const embeddingsQueue = new Queue<EmbeddingJobData>(QUEUES.embeddings, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
});

// ── Worker ────────────────────────────────────────────────────────────────────
async function processEmbedding(job: Job<EmbeddingJobData>): Promise<void> {
  const { workspaceId, filePath, chunkText } = job.data;

  // 1. Compute embedding via OpenRouter.
  const [vector] = await embed([chunkText]);
  if (!vector) {
    throw new Error(`Embedding returned empty result for chunk in ${filePath}`);
  }

  // 2. Upsert into repo_embeddings.
  //    On conflict (same workspace + filePath + chunkText) replace the embedding.
  await db
    .insert(repoEmbeddings)
    .values({
      workspaceId,
      filePath,
      chunkText,
      embedding: vector,
    })
    .onConflictDoNothing(); // simple dedup; a proper upsert can be added later

  console.log(`[embeddings] Stored embedding for ${filePath} (workspace: ${workspaceId})`);
}

let embeddingsWorker: Worker<EmbeddingJobData> | null = null;

/** Start the embeddings BullMQ worker. Call once at server startup. */
export function startEmbeddingsWorker(): void {
  if (embeddingsWorker) return; // idempotent

  embeddingsWorker = new Worker<EmbeddingJobData>(QUEUES.embeddings, processEmbedding, {
    connection: redis,
    concurrency: 3, // limit concurrent embedding API calls
  });

  embeddingsWorker.on("completed", (job) => {
    console.log(`[embeddings] Job ${job.id} completed.`);
  });

  embeddingsWorker.on("failed", (job, err) => {
    console.error(`[embeddings] Job ${job?.id} failed:`, err.message);
  });

  console.log("Embeddings worker started.");
}
