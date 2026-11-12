import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../_components/auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle="We email you a single-use link that is valid for 60 minutes."
    >
      <Suspense fallback={<FormSkeleton />}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthCard>
  );
}

function FormSkeleton() {
  return <div className="h-24 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />;
}
