// Vitest stand-in for next/navigation: redirect throws the same digest-style
// error shape Next uses, without server runtime dependencies.
export function redirect(url: string): never {
  const err = new Error(`NEXT_REDIRECT: ${url}`) as Error & { digest?: string };
  err.digest = `NEXT_REDIRECT;replace;${url};`;
  throw err;
}

export function notFound(): never {
  const err = new Error("NEXT_NOT_FOUND") as Error & { digest?: string };
  err.digest = "NEXT_NOT_FOUND";
  throw err;
}
