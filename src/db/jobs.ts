/**
 * Maintenance jobs (spec §6 step 7 reconciler). Run manually or from a
 * scheduler (cron / Vercel Cron) once deployed:
 *
 *   npm run jobs:run
 *
 * - expires `held` reservations older than their TTL (full refund)
 * - zeroes expired credit buckets, writing matching `expiry` ledger rows
 */
import "dotenv/config";
import { loadLocalEnv } from "./run-migrations";
import { expireBuckets, expireStaleReservations } from "../lib/wallet";

loadLocalEnv();

async function main() {
  console.log("[jobs] running wallet maintenance…");
  const expiredReservations = await expireStaleReservations();
  const expiredBucketCredits = await expireBuckets();
  console.log(
    `[jobs] done — expired reservations: ${expiredReservations}, expired bucket credits: ${expiredBucketCredits}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[jobs] failed:", err);
  process.exit(1);
});
