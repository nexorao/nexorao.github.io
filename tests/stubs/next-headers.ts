// Vitest stand-in for next/headers: no request scope exists in tests, so
// empty headers and a no-op cookie jar are returned instead of throwing.
export async function headers(): Promise<Headers> {
  return new Headers();
}

export interface CookieStore {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string): void;
  delete(name: string): void;
}

export async function cookies(): Promise<CookieStore> {
  const jar = new Map<string, string>();
  return {
    get(name) {
      return jar.has(name) ? { name, value: jar.get(name) as string } : undefined;
    },
    set(name, value) {
      jar.set(name, value);
    },
    delete(name) {
      jar.delete(name);
    },
  };
}
