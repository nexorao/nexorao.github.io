import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Loads .env.local when dotenv only found .env (matches drizzle.config.ts). */
export function loadLocalEnv(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
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
    // ignore — the error below explains what is missing.
  }
  return process.env.DATABASE_URL;
}

const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
);

/**
 * Applies every migration in ./drizzle. Shared by `npm run db:migrate` and
 * the integration test suite so tests always run against the current schema.
 */
export async function runMigrations(connectionString?: string): Promise<void> {
  const url = connectionString ?? loadLocalEnv();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set (copy .env.example → .env.local, or run `npm run db:start`).",
    );
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // This drizzle-orm version requires a Drizzle instance (db.dialect.migrate),
    // so wrap the raw pg.Client before calling migrate().
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}

// CLI entry: `npm run db:migrate`
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/db/run-migrations.ts")) {
  runMigrations()
    .then(() => {
      console.log("[db] migrations applied");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[db] migration failed:", err);
      process.exit(1);
    });
}
