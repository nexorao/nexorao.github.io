/**
 * Pure Drizzle factory — NO "server-only" guard, because scripts (seed,
 * tests, jobs) run outside Next.js. The request-time app imports the lazy
 * singleton from ./index instead.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const createdPools = new Set<pg.Pool>();

export function createDb(connectionString: string): NodePgDatabase<typeof schema> {
  const pool = new pg.Pool({ connectionString });
  createdPools.add(pool);
  return drizzle(pool, { schema });
}

/** Test/script teardown: closes every pool created via createDb(). */
export async function closeAllDbPools(): Promise<void> {
  await Promise.all([...createdPools].map((p) => p.end()));
  createdPools.clear();
}

export { schema };
export type Db = NodePgDatabase<typeof schema>;
