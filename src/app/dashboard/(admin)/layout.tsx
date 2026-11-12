import type { ReactNode } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/** Keep every admin route behind one role check. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="glass h-96 animate-pulse rounded-xl" aria-hidden />}>
      <RequireAdmin>{children}</RequireAdmin>
    </Suspense>
  );
}

async function RequireAdmin({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user.isAdmin) redirect("/dashboard");
  return children;
}
