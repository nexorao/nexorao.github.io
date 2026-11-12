import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../_components/auth-card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Create an account and start with daily free credits right away."
    >
      <Suspense fallback={<RegisterFormSkeleton />}>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}

function RegisterFormSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-10 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />
      <div className="h-10 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />
      <div className="h-10 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />
      <div className="h-10 animate-pulse rounded-md bg-[var(--glass-bg-hover)]" />
    </div>
  );
}
