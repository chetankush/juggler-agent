/**
 * ioredis connection from REDIS_URL.
 * Shared across BullMQ queues and workers.
 */
import Redis from "ioredis";
import { env } from "./env.js";

// ioredis accepts a connection string directly.
export const redis = new Redis(env.REDIS_URL, {
  // Disable auto-reconnect spamming on connection errors during dev.
  maxRetriesPerRequest: null, // required by BullMQ workers
  enableReadyCheck: false,
});

redis.on("error", (err: Error) => {
  console.error("Redis connection error:", err.message);
});

redis.on("connect", () => {
  console.log("Redis connected");
});
