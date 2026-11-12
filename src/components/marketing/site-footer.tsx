import Link from "next/link";
import { Logo } from "@/components/logo";
import { footerNav, site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div
        className="w-full"
        style={{ background: "color-mix(in srgb, var(--bg-1) 55%, transparent)" }}
      >
        <div className="nx-container py-12">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div className="flex flex-col gap-4">
              <Logo />
              <p className="max-w-xs text-sm leading-relaxed text-text-1">
                {site.tagline} Chat, compare and build with official provider
                APIs — billed transparently in credits.
              </p>
              <p className="max-w-xs text-xs leading-relaxed text-text-2">
                All product names are trademarks of their respective owners and
                imply no partnership. Access is via official, authorized APIs
                only.
              </p>
            </div>

            {footerNav.map((group) => (
              <nav key={group.title} aria-label={group.title} className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-2">
                  {group.title}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {group.items.map((item) => (
                    <li key={item.label} className="text-sm">
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="text-text-1 transition-colors outline-none hover:text-text-0 focus-visible:ring-2 focus-visible:ring-violet/60"
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <span className="text-text-2">
                          {item.label}
                          <span className="ml-1.5 rounded-sm bg-[var(--glass-bg-hover)] px-1 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide">
                            soon
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-xs text-text-2 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 {site.name}. All rights reserved.</p>
            <p>Prices verified against official provider docs · last checked 11 Nov 2026</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
