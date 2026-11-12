/**
 * Embedded PostgreSQL helper for LOCAL DEVELOPMENT ONLY (no Docker needed).
 * Production and staging always use a real DATABASE_URL (Supabase, Neon,
 * RDS…); this script only wraps the devDependency `embedded-postgres`.
 *
 *   node scripts/embedded-db.mjs start   # boots on :5433, data in ./.pgdata
 *   node scripts/embedded-db.mjs stop
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function loadEnvLocal() {
  try {
    const raw = readFileSync(path.join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local is optional for these scripts (password has a default).
  }
}

loadEnvLocal();

const DEV_USER = process.env.DEV_DB_USER ?? "postgres";
// MUST match DATABASE_URL in .env.local (dev convenience only).
const DEV_PASSWORD = process.env.DEV_DB_PASSWORD ?? "e6lTbTQoSWnk192m";
const DEV_PORT = Number(process.env.DEV_DB_PORT ?? 5433);

const { default: EmbeddedPostgres } = await import("embedded-postgres");

const pg = new EmbeddedPostgres({
  databaseDir: path.join(ROOT, ".pgdata"),
  user: DEV_USER,
  password: DEV_PASSWORD,
  port: DEV_PORT,
  persistent: true,
  // Force a UTF-8 cluster with proper Unicode collation. Without this, Windows
  // default locales (e.g. English_India.1252) initialize the cluster as
  // WIN1252, which cannot store ₹, emoji or other non-Latin-1 text.
  initdbFlags: ["--encoding=UTF8", "--locale-provider=icu", "--icu-locale=en-US"],
});

const command = process.argv[2] ?? "start";

async function clusterExists() {
  const { existsSync } = await import("node:fs");
  return existsSync(path.join(ROOT, ".pgdata", "PG_VERSION"));
}

if (command === "start") {
  if (!(await clusterExists())) {
    console.log("[embedded-db] initializing cluster (UTF-8 / ICU en-US)…");
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase("nexora");
    console.log(`[embedded-db] created database "nexora"`);
  } catch {
    console.log(`[embedded-db] database "nexora" already exists`);
  }
  console.log(`[embedded-db] PostgreSQL ready on port ${DEV_PORT} (data: ./.pgdata)`);
} else if (command === "stop") {
  await pg.stop();
  console.log("[embedded-db] stopped");
} else {
  console.error("Usage: node scripts/embedded-db.mjs <start|stop>");
  process.exit(1);
}
