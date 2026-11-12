import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthCard } from "../_components/auth-card";

export const metadata: Metadata = { title: "Email confirmation not required" };

export default function VerifyEmailPage() {
  return (
    <AuthCard
      title="You can sign in now"
      subtitle="Email confirmation is currently turned off. Your account is ready to use."
    >
      <Button asChild className="w-full">
        <Link href="/login">Go to sign in</Link>
      </Button>
    </AuthCard>
  );
}
