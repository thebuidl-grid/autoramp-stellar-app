/**
 * Routes a logged-out visitor may stay on. AuthProvider sends anyone else
 * back to the landing page, so a new public page (like /waitlist) MUST be
 * listed here or it will bounce visitors to "/".
 *
 * Prefixes are matched on a path-segment boundary: "/waitlist" and
 * "/waitlist/x" match, "/waitlisting" does not.
 */
export const PUBLIC_PREFIXES = ["/auth", "/admin", "/merchant", "/docs", "/dashboard", "/waitlist"] as const;

export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
