import { Suspense } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getSessionUser } from "@/lib/auth/session";

/** Marketing chrome: header + footer wrap every public page. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={<div className="sticky top-0 z-40 h-16 border-b border-line bg-bg-0/80" aria-hidden />}>
        <SessionAwareSiteHeader />
      </Suspense>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

async function SessionAwareSiteHeader() {
  if (process.env.NEXORAO_STATIC_EXPORT === "1") {
    // Static preview builds have no database or request cookies available.
    return <SiteHeader isAuthenticated={false} />;
  }
  const user = await getSessionUser();
  return <SiteHeader isAuthenticated={Boolean(user)} />;
}
