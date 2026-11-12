import { Suspense } from "react";
import { DashboardNav } from "./dashboard-nav";
import { DashboardTopbar } from "./dashboard-topbar";

/**
 * Dashboard chrome. The nav reads the session (request-time data under
 * cacheComponents), so it renders inside a Suspense boundary and streams in
 * over a static shell. Each page owns its own <Suspense> for content.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-0">
      <Suspense fallback={<NavSkeleton />}>
        <DashboardNav />
      </Suspense>
      <div className="min-h-screen lg:pl-[255px]">
        <DashboardTopbar />
        <main className="mx-auto w-full max-w-[1280px] px-4 py-5 md:px-7 md:py-7">{children}</main>
      </div>
    </div>
  );
}

function NavSkeleton() {
  return <div className="fixed inset-y-0 left-0 z-30 hidden w-[255px] animate-pulse border-r border-line bg-bg-1 lg:block" aria-hidden />;
}
