import { redirect } from "react-router";

import { getActiveBackend } from "#/api/backend-registry/active-store";
import { getSettingsQueryFn } from "#/hooks/query/use-settings";
import {
  SETTINGS_QUERY_KEYS,
  AGENT_PROFILES_QUERY_KEYS,
} from "#/hooks/query/query-keys";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { queryClient } from "#/query-client-config";

/**
 * Issue a ``redirect`` to ``/settings/agent`` when the personal settings
 * say the active agent is ACP.
 *
 * The ACP sub-agent owns its own LLM and condenser, so the canvas-side
 * surfaces that configure those concepts (``/settings``,
 * ``/settings/condenser``) have nothing useful to do while ACP is active.
 * (``/mcp`` is intentionally *not* guarded: ``mcp_config`` is now forwarded
 * to the ACP subprocess at session creation.) Doing the redirect in a
 * ``clientLoader`` (instead of a per-route ``useEffect``) prevents the
 * one-frame flash of the old content before the guard fires.
 *
 * ``staleTime: 0`` is intentional: the read drives a redirect, and a
 * 5-minute stale tolerance would let a cross-tab agent-kind flip route
 * the user to the wrong page until the cache caught up. PATCH /settings
 * already invalidates this key, so the forced refetch only fires when
 * something might actually have changed.
 *
 * Fall through silently on settings-fetch errors (unauthed, network,
 * local agent-server not running) — better to render the page than
 * redirect-loop on a missing payload.
 *
 * Cache key is aligned with {@link useSettings} so the loader and the
 * in-render hook share a single cache entry rather than thrashing the
 * same data through two different keys.
 */
export async function redirectIfAcpActive() {
  try {
    const active = getActiveBackend();
    // The active AgentProfile is the current agent (activate is pointer-only
    // and never writes agent_settings), so it's the authoritative ACP signal.
    // Fall back to the global agent settings when the profile list is
    // unavailable (older backend, fetch error) so behavior degrades gracefully.
    let isAcp: boolean | undefined;
    try {
      const profiles = await queryClient.fetchQuery({
        queryKey: [
          ...AGENT_PROFILES_QUERY_KEYS.all,
          active.backend.id,
          active.orgId,
        ],
        queryFn: AgentProfilesService.listProfiles,
        staleTime: 0,
      });
      const activeId = profiles?.active_agent_profile_id ?? null;
      const activeProfile = profiles?.profiles.find(
        (profile) => profile.id != null && profile.id === activeId,
      );
      if (activeProfile) isAcp = activeProfile.agent_kind === "acp";
    } catch {
      // Agent profiles unavailable — fall back to settings below.
    }

    if (isAcp === undefined) {
      const personalSettings = await queryClient.fetchQuery({
        queryKey: [
          ...SETTINGS_QUERY_KEYS.byScope("personal"),
          active.backend.id,
          active.orgId,
        ],
        queryFn: () => getSettingsQueryFn("personal"),
        staleTime: 0,
      });
      isAcp = personalSettings?.agent_settings?.agent_kind === "acp";
    }

    if (isAcp) {
      return redirect("/settings/agents");
    }
  } catch {
    // Settings unfetchable — let the page render.
  }
  return null;
}
