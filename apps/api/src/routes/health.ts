/**
 * Health check route.
 * GET /health — returns server status and timestamp.
 */
import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    return reply.send({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "@aicrm/api",
    });
  });
}
