// Vitest stand-in for next/cache: cache directives are compiler-managed in
// Next; under plain Node they are no-ops.
export function cacheLife(profile?: unknown): void {
  void profile;
}
export function cacheTag(tag: string | string[], ...rest: string[]): void {
  void tag;
  void rest;
}
