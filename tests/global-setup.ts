import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

/**
 * Global test setup (runs once, before all workers).
 *
 * Creates a dedicated `nexora_test` database next to the dev database,
 * applies all migrations, and seeds the minimal plan rows the wallet tests
 * need (free: 100 daily credits; plus: 25,000 monthly). Every worker then
 * points DATABASE_URL at nexora_test via tests/setup.ts.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config();
dotenv.config({ path: path.join(root, ".env.local"), override: true });

export const TEST_DB_URL = (process.env.DATABASE_URL ?? "").replace(
  /\/nexora(\?|$)/,
  "/nexora_test$1",
);

const ADMIN_URL = (TEST_DB_URL ?? "").replace(/\/nexora_test(\?|$)/, "/postgres$1");

export default async function setup(): Promise<void> {
  if (!TEST_DB_URL) {
    throw new Error("DATABASE_URL is not set — run `npm run db:start` first.");
  }

  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS nexora_test WITH (FORCE)`);
    await admin.query(`CREATE DATABASE nexora_test`);
  } finally {
    await admin.end();
  }

  // Apply every migration to the fresh test database.
  const { runMigrations } = await import("../src/db/run-migrations");
  await runMigrations(TEST_DB_URL);

  // Minimal plan seed for the wallet flows (daily grant, plan resolution).
  const seeder = new Client({ connectionString: TEST_DB_URL });
  await seeder.connect();
  try {
    await seeder.query(
      `INSERT INTO plans (id, name, price_paise_monthly, monthly_credits, daily_free_credits)
       VALUES ('free', 'Free', 0, 0, 100), ('plus', 'Plus', 29900, 25000, 0), ('pro', 'Pro', 79900, 75000, 0)
       ON CONFLICT (id) DO NOTHING`,
    );
    await seeder.query(
      `INSERT INTO roles (name, description)
       VALUES ('user', 'Default role for every account'), ('admin', 'Full platform administration')
       ON CONFLICT (name) DO NOTHING`,
    );
    await seeder.query(
      `INSERT INTO settings (key, value, description)
       VALUES ('consumptionOrder', '["daily_free","promotional","subscription","purchased"]'::jsonb, 'test seed'),
              ('reservationTtlMinutes', '10'::jsonb, 'test seed')
       ON CONFLICT (key) DO NOTHING`,
    );
  } finally {
    await seeder.end();
  }

  console.log("[test] nexora_test database ready (migrated + seeded)");
}
