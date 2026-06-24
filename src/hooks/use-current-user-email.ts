import { useQuery } from "@tanstack/react-query";
import { useSettings } from "#/hooks/query/use-settings";
import { isAuthRequired } from "#/api/agent-server-config";
import { parseUserinfoEmail } from "#/utils/oauth2-userinfo";

/**
 * The current user's email, used to compute the "mine" conversation filter.
 *
 * Behind the Entra/oauth2-proxy deployment, the authenticated identity is
 * available with NO platform change: oauth2-proxy serves `/oauth2/userinfo`
 * (the session email as JSON) and Caddy already proxies `/oauth2/*`. We read it
 * there when auth is required, and fall back to the user-editable git email for
 * local/dev (where the endpoint doesn't exist) — so "mine" is reliable in
 * production and advisory locally, with one upgrade point.
 */
export function useCurrentUserEmail(): string | null {
  const { data: settings } = useSettings();

  const { data: proxyEmail } = useQuery({
    queryKey: ["oauth2-userinfo-email"],
    // Only behind the auth proxy; in local/dev/test the endpoint isn't present.
    enabled: isAuthRequired(),
    queryFn: async () => {
      const response = await fetch("/oauth2/userinfo", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      return parseUserinfoEmail(await response.json());
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    meta: { disableToast: true },
  });

  const fromSettings =
    settings?.git_user_email?.trim() || settings?.email?.trim() || null;

  // proxyEmail is undefined while loading/disabled and null on failure — both
  // fall through to the advisory git email until a real identity resolves.
  return proxyEmail ?? fromSettings;
}
