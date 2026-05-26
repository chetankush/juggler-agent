import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

// Load the monorepo root `.env` (single source of truth) so NEXT_PUBLIC_* vars
// are available for inlining. A local apps/web/.env.local still takes priority
// (Next loads it after this runs).
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) dotenv.config({ path: rootEnv });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@aicrm/shared"],
};

export default nextConfig;
