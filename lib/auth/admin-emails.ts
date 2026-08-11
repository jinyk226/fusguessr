/**
 * ADMIN_EMAILS allowlist parsing.
 *
 * The env var only *bootstraps* admin access: a matching email is promoted to
 * the ADMIN role in the database on sign-in, and the database row is
 * authoritative from then on. That means revoking an admin means changing the
 * database, not just the env var - which is the safer default, since an env
 * var edit alone shouldn't silently strip someone mid-session.
 *
 * Kept dependency-free so the matching rules are directly unit-testable.
 */

/** Splits the comma-separated env value into normalised addresses. */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/** Case-insensitive membership test against the allowlist. */
export function isAdminEmail(
  email: string | null | undefined,
  raw: string | undefined = process.env.ADMIN_EMAILS,
): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).includes(email.trim().toLowerCase());
}
