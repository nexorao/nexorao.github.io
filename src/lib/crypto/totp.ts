import { createCipheriv, createDecipheriv, createHash, createHmac, createSecretKey, randomBytes, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// AES-256-GCM envelope encryption (provider credentials, TOTP secrets)
// ---------------------------------------------------------------------------

/**
 * Key source: APP_ENCRYPTION_KEY — base64-encoded 32 bytes.
 * In development a random key is generated per process so nothing is ever
 * hardcoded; data encrypted with it does not survive restarts (documented
 * in .env.example). Production without an explicit key throws.
 */
export function getEncryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length === 32) return key;
    throw new Error(
      "APP_ENCRYPTION_KEY must decode to exactly 32 bytes (generate with: openssl rand -base64 32).",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "APP_ENCRYPTION_KEY is required in production (openssl rand -base64 32).",
    );
  }
  if (process.env.VITEST) {
    // Deterministic key for reproducible tests.
    return createHash("sha256").update("nexora-test-key").digest();
  }
  return randomBytes(32);
}

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptString(plaintext: string): EncryptedEnvelope {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptString(envelope: EncryptedEnvelope): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238) — optional second factor, no external dependency
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/[\s-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP with the default 6 digits / SHA-1 / 30s step. */
export function generateTotp(
  secret: Buffer,
  timeStepSeconds = 30,
  digits = 6,
  atUnixTime = Math.floor(Date.now() / 1000),
): string {
  const counter = Math.floor(atUnixTime / timeStepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * Verify with a ±1 step window for clock drift, comparing in constant time.
 * `atUnixTime` injectable for deterministic tests.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  atUnixTime = Math.floor(Date.now() / 1000),
): boolean {
  const normalized = code.replace(/\D/g, "");
  if (normalized.length !== 6) return false;
  for (const drift of [-1, 0, 1]) {
    const candidate = generateTotp(secret, 30, 6, atUnixTime + drift * 30);
    const a = Buffer.from(candidate);
    const b = Buffer.from(normalized);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** otpauth:// URI accepted by authenticator apps (Google, 1Password, Aegis…). */
export function totpUri(secretBase32: string, email: string, issuer = "NEXORA AI"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Allow a newly enrolled secret to be trusted for the login that confirmed
 * it — a fresh TOTP can race the 30s window edge.
 */
export function generateSecret(): Buffer {
  return createSecretKey(randomBytes(20)).export() as Buffer;
}
