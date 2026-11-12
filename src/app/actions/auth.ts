"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { destroySession } from "@/lib/auth/session";
import {
  registerUser,
  authenticate,
  requestPasswordReset,
  resetPasswordByToken,
} from "@/lib/auth/users";
import { rateLimitAsync, resetRateLimits } from "@/lib/rate-limit";

/**
 * Auth server actions (spec §16): validation on the server, rate limiting
 * per IP, generic error messages that do not leak account existence.
 */

export interface AuthActionState {
  error?: string;
  notice?: string;
  needsTotp?: boolean;
  fieldErrors?: Record<string, string[]>;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .regex(/[a-zA-Z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

const registerSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80, "Name is too long"),
  email: z.email("Enter a valid email address").max(254),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  password: z.string().min(1, "Enter your password").max(200),
  totpCode: z
    .string()
    .trim()
    .regex(/^\d{0,6}$/, "The code is 6 digits")
    .optional(),
});

const emailSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
});

function safeInternalPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes(String.fromCharCode(92)) || value.includes(String.fromCharCode(10)) || value.includes(String.fromCharCode(13))) {
    return null;
  }
  try {
    const parsed = new URL(value, "https://nexora.invalid");
    if (parsed.origin !== "https://nexora.invalid") return null;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}

export async function registerAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const ip = await clientIp();
  const limit = await rateLimitAsync(`register:${ip}`, 5, 15 * 60_000);
  if (!limit.allowed) {
    return { error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  }

  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: flattenIssues(parsed.error) };
  }

  await registerUser(
    parsed.data.email,
    parsed.data.name,
    parsed.data.password,
    String(formData.get("referralCode") ?? ""),
  );
  const next = safeInternalPath(formData.get("next"));
  redirect(next ? "/login?registration=1&next=" + encodeURIComponent(next) : "/login?registration=1");
}

export async function loginAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const ip = await clientIp();
  const emailRaw = String(formData.get("email") ?? "");
  const limit = await rateLimitAsync(`login:${ip}:${emailRaw.toLowerCase()}`, 10, 15 * 60_000);
  if (!limit.allowed) {
    return { error: `Too many sign-in attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  }

  const parsed = loginSchema.safeParse({
    email: emailRaw,
    password: formData.get("password"),
    totpCode: formData.get("totpCode") || undefined,
  });
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: flattenIssues(parsed.error) };
  }

  const result = await authenticate(parsed.data.email, parsed.data.password, parsed.data.totpCode);

  if ("needsTotp" in result) {
    return { needsTotp: true, notice: "Enter the 6-digit code from your authenticator app." };
  }
  if ("error" in result) {
    switch (result.error) {
      case "suspended":
        return { error: "This account is suspended. Contact support." };
      default:
        return { error: "Email or password is incorrect." };
    }
  }

  redirect(safeInternalPath(formData.get("next")) ?? "/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function requestPasswordResetAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const ip = await clientIp();
  const limit = await rateLimitAsync(`reset:${ip}`, 3, 15 * 60_000);
  if (!limit.allowed) {
    return { error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  }
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter a valid email address." };

  await requestPasswordReset(parsed.data.email);
  return { notice: "If that address has an account, a reset link is on its way." };
}

export async function resetPasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const ip = await clientIp();
  const limit = await rateLimitAsync(`reset-confirm:${ip}`, 10, 15 * 60_000);
  if (!limit.allowed) {
    return { error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` };
  }

  const schema = z.object({
    token: z.string().min(1, "Missing reset token"),
    password: passwordSchema,
    confirm: z.string(),
  });
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: flattenIssues(parsed.error) };
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return { error: "Passwords do not match.", fieldErrors: { confirm: ["Passwords do not match"] } };
  }

  const ok = await resetPasswordByToken(parsed.data.token, parsed.data.password);
  if (!ok) return { error: "This reset link is invalid or has expired. Request a new one." };

  redirect("/login?reset=1");
}

function flattenIssues(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

/** Test-only helper (exported server actions cannot be tested directly). */
export async function _clearRateLimitsForTests(): Promise<void> {
  resetRateLimits();
}
