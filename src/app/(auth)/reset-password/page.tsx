import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../_components/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Set a new password"
      subtitle="Your link is single-use. After the reset, all existing sessions are signed out."
    >
      <Suspense fallback={<FormSkeleton />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-10 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />
      <div className="h-10 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />
      <div className="h-10 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />
    </div>
  );
}
