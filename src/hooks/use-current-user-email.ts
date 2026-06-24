import { useSettings } from "#/hooks/query/use-settings";

/**
 * The current user's email, used to compute the "mine" conversation filter.
 *
 * The local agent-server backend has no enforced per-user identity, and the
 * Entra email the proxy authenticates (`X-Auth-Request-Email`) is a server-side
 * header the browser can't read. So today this resolves the user-editable git
 * email — advisory, good enough to organize a visible-by-default list.
 *
 * Upgrade path (see `firehose-plan.md`): once the platform adds a tiny Caddy
 * `/api/whoami` route echoing `X-Auth-Request-Email`, fetch it here and prefer
 * it over the git email — "mine" becomes reliable with no other SPA change.
 */
export function useCurrentUserEmail(): string | null {
  const { data: settings } = useSettings();
  return settings?.git_user_email?.trim() || settings?.email?.trim() || null;
}
