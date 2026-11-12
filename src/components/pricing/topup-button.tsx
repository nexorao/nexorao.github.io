"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Client boundary for the top-up CTA — a Server Component cannot pass
 * event handlers.
 */
export function TopUpButton({ packName, packId }: { packName: string; packId: string }) {
  return (
    <Button variant="glass" size="sm" className="w-full" asChild>
      <Link href={`/checkout/start?kind=topup&pack=${encodeURIComponent(packId)}`} aria-label={`Buy ${packName} credits`}>
        <Zap className="size-3.5" aria-hidden />
        Buy pack
      </Link>
    </Button>
  );
}
