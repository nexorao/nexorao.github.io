import Link from "next/link";
import Image from "next/image";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label={`${site.shortName} — home`}
      className={cn("flex items-center gap-2.5", className)}
    >
      <Image
        src="/brand/nexora-mark.webp"
        alt=""
        aria-hidden
        width={512}
        height={512}
        priority
        className="size-8 shrink-0 rounded-lg object-cover"
      />
      <span className="font-serif text-[14px] font-semibold tracking-[0.2em] text-text-0">
        {site.shortName}
      </span>
    </Link>
  );
}
