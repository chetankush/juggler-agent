/**
 * Embeddings route.
 *
 * POST /embeddings — accepts an array of RepoChunk objects from the VS Code
 * extension scanner, validates them, and enqueues embedding jobs in BullMQ.
 * The actual embedding + pgvector upsert happens asynchronously in the worker.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { repoChunkSchema } from "@aicrm/shared";
import { embeddingsQueue } from "../queues/embeddings.queue.js";
import { verifyAuth } from "../lib/auth.js";

const batchSchema = z.object({
  chunks: z.array(repoChunkSchema).min(1).max(200),
});

export async function embeddingsRoutes(app: FastifyInstance): Promise<void> {
  // Embedding ingestion requires auth.
  app.addHook("preHandler", verifyAuth);

  app.post<{ Body: unknown }>("/embeddings", async (request, reply) => {
    const parseResult = batchSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }

    const { chunks } = parseResult.data;

    // Enqueue each chunk as a separate job so they can be processed concurrently.
    const jobs = await Promise.all(
      chunks.map((chunk) =>
        embeddingsQueue.add("embed-chunk", chunk, {
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
        })
      )
    );

    return reply.status(202).send({
      queued: jobs.length,
      message: `${jobs.length} chunk(s) queued for embedding.`,
    });
  });
}
