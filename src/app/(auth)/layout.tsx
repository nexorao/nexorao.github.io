import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * Auth chrome: a centered narrow column with the brand on top. Forms are
 * client components (useActionState) rendered by each page; the pages stay
 * cacheComponents-safe by wrapping any request-dependent content in
 * <Suspense>.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="nx-container flex min-h-[85vh] flex-col items-center justify-center py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        {children}
        <p className="mt-8 text-center text-xs leading-relaxed text-text-2">
          <Link href="/" className="transition-colors hover:text-text-1">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
