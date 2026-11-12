/**
 * In-process sliding-window rate limiter.
 *
 * Without a shared store, these limits apply to one running server process.
 */
interface Attempt {
  timestamps: number[];
}

const buckets = new Map<string, Attempt>();

const CLEANUP_EVERY_MS = 60_000;
let lastCleanup = Date.now();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  if (now - lastCleanup > CLEANUP_EVERY_MS) {
    lastCleanup = now;
    for (const [k, v] of buckets) {
      if (!v.timestamps.some((t) => now - t < windowMs)) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: limit - bucket.timestamps.length,
    retryAfterSeconds: 0,
  };
}

let redisWarningShown = false;

/** Shared sliding-window limiter when Upstash is configured; local fallback for dev/single-instance installs. */
export async function rateLimitAsync(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production" && !redisWarningShown) {
      redisWarningShown = true;
      console.warn("[rate-limit] Upstash is not configured; using per-process limits. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for multi-instance production.");
    }
    return rateLimit(key, limit, windowMs);
  }

  const now = Date.now();
  const script = [
    "local now=tonumber(ARGV[1]); local window=tonumber(ARGV[2]); local limit=tonumber(ARGV[3]);",
    "redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now-window); local count=redis.call('ZCARD',KEYS[1]);",
    "if count>=limit then local first=redis.call('ZRANGE',KEYS[1],0,0,'WITHSCORES'); return {0,0,math.max(1,tonumber(first[2])+window-now)} end;",
    "redis.call('ZADD',KEYS[1],now,ARGV[4]); redis.call('PEXPIRE',KEYS[1],window); return {1,limit-count-1,0};",
  ].join(" ");
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(["EVAL", script, "1", `nx:rl:${key}`, String(now), String(windowMs), String(limit), `${now}:${crypto.randomUUID()}`]),
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) throw new Error(`Redis REST returned ${response.status}`);
    const payload = await response.json() as { result?: unknown };
    if (!Array.isArray(payload.result) || payload.result.length < 3) throw new Error("Redis returned an invalid rate-limit result");
    return {
      allowed: Number(payload.result[0]) === 1,
      remaining: Number(payload.result[1]),
      retryAfterSeconds: Math.max(1, Math.ceil(Number(payload.result[2]) / 1000)) * (Number(payload.result[0]) === 1 ? 0 : 1),
    };
  } catch (error) {
    console.error("[rate-limit] Redis unavailable", error);
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, remaining: 0, retryAfterSeconds: 5 };
    }
    return rateLimit(key, limit, windowMs);
  }
}

/** Test helper. */
export function resetRateLimits() {
  buckets.clear();
}
