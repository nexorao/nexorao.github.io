import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/**
 * Per-worker setup: point DATABASE_URL at the test database BEFORE any app
 * module (db proxy) is imported, and force deterministic crypto for tests.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config();
dotenv.config({ path: path.join(root, ".env.local"), override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — run `npm run db:start` first.");
}

process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/nexora(\?|$)/, "/nexora_test$1");
process.env.SESSION_TTL_DAYS = process.env.SESSION_TTL_DAYS || "30";
process.env.VITEST = "true";
