import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../_components/auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your NEXORAO workspace."
    >
      <Suspense fallback={<LoginFormSkeleton />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-10 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />
      <div className="h-10 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />
      <div className="h-10 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />
    </div>
  );
}
