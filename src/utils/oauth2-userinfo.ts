/**
 * Parse the authenticated user's email out of oauth2-proxy's `/oauth2/userinfo`
 * JSON. That endpoint returns the current session's identity (email from the
 * configured email claim — `preferred_username` / the Entra UPN in this deploy)
 * and is already exposed by the Caddy `/oauth2/*` route, so the SPA can read a
 * reliable identity with no platform change.
 *
 * Defensive: the exact field name varies across oauth2-proxy versions, so try
 * the known candidates in order. Pure (no React/DOM) for unit testing, and
 * narrows `unknown` via a type guard rather than a type assertion.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const EMAIL_FIELDS = ["email", "preferredUsername", "user"] as const;

export function parseUserinfoEmail(data: unknown): string | null {
  if (!isRecord(data)) return null;
  for (const field of EMAIL_FIELDS) {
    const value = data[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
