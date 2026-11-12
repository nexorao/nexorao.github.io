import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import type { Config } from "drizzle-kit";

// Loads .env.local manually if dotenv didn't (dotenv reads .env by default).
if (!process.env.DATABASE_URL) {
  try {
    const envLocal = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(envLocal)) {
      for (const line of fs.readFileSync(envLocal, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch {
    // Fall through to the error below.
  }
}

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a PostgreSQL database (docker compose up -d db).",
  );
  process.exit(1);
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
} satisfies Config;
