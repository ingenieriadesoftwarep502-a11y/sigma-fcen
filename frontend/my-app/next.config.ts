import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// The repo-root .env is the only env file, shared by backend and frontend.
// npm scripts run from frontend/my-app, so the root is two levels up.
const ROOT_ENV_FILE = path.resolve(process.cwd(), "../../.env");

const PUBLIC_PREFIX = "NEXT_PUBLIC_";

/**
 * Picks the NEXT_PUBLIC_* keys from the root .env content. Backend secrets
 * (SECRET_KEY, DATABASE_URL, ...) never reach the frontend. A variable already
 * set in the real environment (e.g. CI) wins over the file.
 */
export function publicEnvFrom(
  content: string,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  const publicEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(parseEnv(content))) {
    if (key.startsWith(PUBLIC_PREFIX) && value !== undefined) {
      publicEnv[key] = processEnv[key] ?? value;
    }
  }
  return publicEnv;
}

const rootEnvContent = existsSync(ROOT_ENV_FILE) ? readFileSync(ROOT_ENV_FILE, "utf8") : "";

const nextConfig: NextConfig = {
  env: publicEnvFrom(rootEnvContent, process.env),
};

export default nextConfig;
