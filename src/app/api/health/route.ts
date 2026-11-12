import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Live readiness endpoint. Never returns raw database errors or secret values.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const encryptionConfigured = Boolean(process.env.APP_ENCRYPTION_KEY);
    const ready = process.env.NODE_ENV !== "production" || encryptionConfigured;
    return Response.json({
      ok: ready,
      service: "nexora-web",
      phase: 8,
      checks: {
        web: "ok",
        database: { status: "ok", latencyMs: Date.now() - startedAt },
        encryption: encryptionConfigured ? "configured" : "missing",
        email: process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL ? "configured" : "development-only",
        payments: process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET ? "configured" : "disabled",
        rateLimit: process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? "distributed" : "per-process",
      },
      time: new Date().toISOString(),
    }, { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json(
      {
        ok: false,
        service: "nexora-web",
        phase: 8,
        checks: {
          web: "ok",
          database: {
            status: "unreachable",
            latencyMs: Date.now() - startedAt,
            reason: "The database health probe failed.",
          },
        },
        time: new Date().toISOString(),
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
