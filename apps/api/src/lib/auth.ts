/**
 * Fastify preHandler: verifies a Supabase JWT from the Authorization header
 * and attaches the authenticated user to `request.user`.
 *
 * Usage:
 *   fastify.addHook("preHandler", verifyAuth);
 *   // or per-route:
 *   fastify.get("/protected", { preHandler: verifyAuth }, handler);
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabase } from "./supabase.js";

// Extend FastifyRequest so TypeScript knows about request.user throughout routes.
declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      email?: string;
    };
  }
}

export async function verifyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Missing or invalid Authorization header." });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    reply.status(401).send({ error: "Invalid or expired token." });
    return;
  }

  // Attach user to request for downstream handlers.
  request.user = {
    id: data.user.id,
    email: data.user.email,
  };
}
