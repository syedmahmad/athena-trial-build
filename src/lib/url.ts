/**
 * Guards for user-supplied redirect targets — the `next` / `redirect_url` query
 * param that auth flows round-trip through (magic link, Google OAuth, password
 * reset). Not a "use client" module, so both server routes and client
 * components can import it.
 *
 * Only same-origin relative paths are allowed. Protocol-relative (`//evil.com`)
 * and backslash (`/\evil.com`) forms pass a naive `startsWith("/")` check but
 * resolve OFF-origin when handed to `new URL(value, origin)` — browsers treat a
 * leading `\` as `/`. Rejecting them stops a freshly-authenticated user from
 * being bounced to an attacker's site.
 */
export function isSafeRelativePath(next: unknown): next is string {
  return (
    typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
  );
}

/** Returns `path` when it is a safe same-origin relative path, else `fallback`. */
export function safeRelativePath(
  path: string | null | undefined,
  fallback = "/dashboard"
): string {
  return isSafeRelativePath(path) ? path : fallback;
}
