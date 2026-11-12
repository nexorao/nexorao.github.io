import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Shared glass card shell for every auth page. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass">
      <CardHeader className="gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-0">{title}</h1>
        {subtitle ? <p className="text-sm leading-relaxed text-text-1">{subtitle}</p> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

/** Small red text under an input for Zod field errors. */
export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-danger">{messages[0]}</p>;
}

/** Info / success / error banners used across auth forms. */
export function Notice({
  tone,
  children,
}: {
  tone: "info" | "success" | "error";
  children: React.ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-danger/40 bg-danger/10 text-danger"
      : tone === "success"
        ? "border-success/40 bg-success/10 text-success"
        : "border-line bg-[var(--glass-bg)] text-text-1";
  return (
    <div className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${styles}`} role="status">
      {children}
    </div>
  );
}
