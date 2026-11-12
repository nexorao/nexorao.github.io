import "server-only";
import { site } from "@/lib/site";

/**
 * Email abstraction. Phase 2 ships a console mailer because no SMTP/API
 * Resend delivery in production, with an explicit local-only log fallback.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailLinkContext {
  action: "verify-email" | "reset-password";
  url: string;
  expiresInMinutes: number;
}

export function renderAuthEmail(ctx: EmailLinkContext): { subject: string; text: string } {
  if (ctx.action === "verify-email") {
    return {
      subject: `Verify your ${site.name} email address`,
      text: [
        `Welcome to ${site.name}.`,
        ``,
        `Confirm your email address to activate your account and receive your daily free credits:`,
        ctx.url,
        ``,
        `This link expires in ${ctx.expiresInMinutes} minutes and can be used once.`,
        `If you did not create an account, you can ignore this email.`,
      ].join("\n"),
    };
  }
  return {
    subject: `Reset your ${site.name} password`,
    text: [
      `A password reset was requested for your ${site.name} account.`,
      ``,
      `Set a new password here:`,
      ctx.url,
      ``,
      `This link expires in ${ctx.expiresInMinutes} minutes and can be used once.`,
      `If you did not request this, ignore this email and your password stays unchanged.`,
    ].join("\n"),
  };
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (apiKey && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[mailer] Resend rejected the message", response.status, detail.slice(0, 300));
      throw new Error(`Email delivery failed (${response.status}).`);
    }
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
  }
  // DEV MAILER — NOT DELIVERED. Printed only in local development.
  console.log(
    [
      "",
      "━━━━━━━━━━ [DEV MAILER — NOT SENT] ━━━━━━━━━━",
      `To:      ${email.to}`,
      `Subject: ${email.subject}`,
      email.text
        .split("\n")
        .map((l) => `│ ${l}`)
        .join("\n"),
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ].join("\n"),
  );
}
