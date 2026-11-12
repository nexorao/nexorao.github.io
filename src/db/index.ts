// NOTE: no "server-only" guard — scripts and jobs (seed, jobs:run, tests)
// import this module under plain Node. Client bundles still cannot import it
// (pg does not bundle for the browser; the build fails loudly if tried).
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/**
 * Lazy request-time Drizzle client (server components/actions only). The
 * pool is constructed and connected on the first real query — importing
 * this module stays side-effect free so static prerendering never touches
 * the database.
 */
let pool: pg.Pool | null = null;
let instance: NodePgDatabase<typeof schema> | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Point it at a PostgreSQL database (see .env.example, or `npm run db:start`).",
    );
  }
  pool = new pg.Pool({ connectionString, max: 10 });
  pool.on("error", (err) => {
    // Idle-client errors must not crash the server process.
    console.error("[db] idle client error:", err.message);
  });
  return pool;
}

function getDbInstance(): NodePgDatabase<typeof schema> {
  if (!instance) instance = drizzle(getPool(), { schema });
  return instance;
}

/**
 * Lazy singleton: property access (db.select(), db.insert(), …) initializes
 * the pool on first use while merely importing `db` performs no I/O.
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    const inst = getDbInstance();
    const value = Reflect.get(inst, prop);
    return typeof value === "function" ? value.bind(inst) : value;
  },
});

/** For scripts and tests that own their connection lifecycle. */
export { createDb, closeAllDbPools } from "./client";

/** Closes the lazy singleton pool (used by tests after integration suites). */
export async function closePool(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = null;
    instance = null;
    await closing.end();
  }
}

export { schema };
