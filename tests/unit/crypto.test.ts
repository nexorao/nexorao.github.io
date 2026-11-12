import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  decryptString,
  encryptString,
  generateTotp,
  verifyTotp,
} from "@/lib/crypto/totp";
import { generateSecret, totpUri } from "@/lib/crypto/totp";
import { generateToken, hashPassword, hashToken, verifyPassword } from "@/lib/crypto/password";

describe("password hashing (scrypt)", () => {
  it("round-trips a correct password", () => {
    const hash = hashPassword("S3cure Passphrase");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("S3cure Passphrase", hash)).toBe(true);
  });

  it("rejects wrong passwords and malformed hashes", () => {
    const hash = hashPassword("S3cure Passphrase");
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(verifyPassword("S3cure Passphrase", "garbage")).toBe(false);
  });

  it("uses a unique salt per hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("verifies with the recorded cost parameters", () => {
    const hash = hashPassword("abc123def");
    const parts = hash.split("$");
    expect(parts[1]).toBe("16384"); // OWASP-recommended N
    expect(parts[2]).toBe("8");
    expect(parts[3]).toBe("1");
  });
});

describe("opaque tokens", () => {
  it("generates url-safe high-entropy tokens", () => {
    const token = generateToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes -> 43 base64url chars
    expect(token).not.toBe(generateToken(32));
  });

  it("hashes tokens as SHA-256 hex (raw token never stored)", () => {
    const h = hashToken("token-value");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("token-value")).toBe(h);
    expect(hashToken("other")).not.toBe(h);
  });
});

describe("base32 (RFC 4648)", () => {
  it("round-trips binary payloads", () => {
    for (const input of ["", "f", "fo", "foo", "foob", "fooba", "foobar"]) {
      const encoded = base32Encode(Buffer.from(input, "ascii"));
      expect(Buffer.from(base32Decode(encoded)).toString("ascii")).toBe(input);
    }
  });

  it("encodes the RFC 6238 reference secret", () => {
    const secret = Buffer.from("12345678901234567890", "ascii");
    expect(base32Encode(secret)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")).toEqual(secret);
  });

  it("tolerates padding, spaces and case", () => {
    // GEZDGNBV encodes exactly 5 bytes ("12345"); padding is ignored.
    expect(base32Decode("gezd gnbv ==")).toEqual(Buffer.from("12345", "ascii"));
  });
});

describe("TOTP (RFC 6238 test vectors, SHA-1, 8 digits)", () => {
  const secret = Buffer.from("12345678901234567890", "ascii");

  it("matches the RFC vectors", () => {
    expect(generateTotp(secret, 30, 8, 59)).toBe("94287082");
    expect(generateTotp(secret, 30, 8, 1_111_111_109)).toBe("07081804");
    expect(generateTotp(secret, 30, 8, 1_111_111_111)).toBe("14050471");
    expect(generateTotp(secret, 30, 8, 1_234_567_890)).toBe("89005924");
    expect(generateTotp(secret, 30, 8, 2_000_000_000)).toBe("69279037");
    expect(generateTotp(secret, 30, 8, 20_000_000_000)).toBe("65353130");
  });

  it("verifies a 6-digit code within the ±1 step window", () => {
    const codeAtT = generateTotp(secret, 30, 6, 1_234_567_890);
    expect(verifyTotp(secret, codeAtT, 1_234_567_890)).toBe(true);
    // Adjacent step is accepted (clock drift).
    expect(verifyTotp(secret, codeAtT, 1_234_567_890 + 30)).toBe(true);
    // Two steps away is rejected.
    expect(verifyTotp(secret, codeAtT, 1_234_567_890 + 90)).toBe(false);
  });

  it("rejects malformed codes", () => {
    expect(verifyTotp(secret, "abc123")).toBe(false);
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });

  it("builds an otpauth:// URI", () => {
    const uri = totpUri("GEZDGNBVGY3TQOJQ", "user@nexora.dev", "NEXORA AI");
    expect(uri).toContain("otpauth://totp/NEXORA%20AI%3Auser%40nexora.dev");
    expect(uri).toContain("secret=GEZDGNBVGY3TQOJQ");
    expect(uri).toContain("period=30");
    expect(uri).toContain("digits=6");
  });

  it("generates 20-byte secrets", () => {
    expect(generateSecret()).toHaveLength(20);
  });
});

describe("AES-256-GCM envelope encryption", () => {
  it("round-trips plaintext", () => {
    const envelope = encryptString("provider-secret-key-🚀");
    expect(Object.keys(envelope).sort()).toEqual(["authTag", "ciphertext", "iv"]);
    expect(decryptString(envelope)).toBe("provider-secret-key-🚀");
  });

  it("produces a fresh IV per encryption", () => {
    const a = encryptString("same");
    const b = encryptString("same");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails loudly on tampering (auth tag)", () => {
    const envelope = encryptString("secret");
    const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + "AAAA" };
    expect(() => decryptString(tampered)).toThrow();
  });

  it("fails loudly on a wrong auth tag", () => {
    const envelope = encryptString("secret");
    const tampered = { ...envelope, authTag: "A".repeat(24) };
    expect(() => decryptString(tampered)).toThrow();
  });
});
