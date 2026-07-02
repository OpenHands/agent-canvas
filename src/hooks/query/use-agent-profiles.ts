import { useQuery } from "@tanstack/react-query";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { CONFIG_CACHE_OPTIONS, AGENT_PROFILES_QUERY_KEYS } from "./query-keys";

export { AGENT_PROFILES_QUERY_KEYS };

interface UseAgentProfilesOptions {
  enabled?: boolean;
}

/**
 * List the user's AgentProfiles (Settings → Agents library). On first GET of an
 * empty store the backend lazily seeds one default profile mirroring the user's
 * prior config (#3719), so the list is never empty for an upgrading user.
 */
export function useAgentProfiles(options: UseAgentProfilesOptions = {}) {
  const { backend, orgId } = useActiveBackend();

  return useQuery({
    // Backend identity isolates the cache across backend/org switches.
    queryKey: [...AGENT_PROFILES_QUERY_KEYS.all, backend.id, orgId],
    queryFn: AgentProfilesService.listProfiles,
    ...CONFIG_CACHE_OPTIONS,
    enabled: options.enabled ?? true,
    meta: { disableToast: true },
  });
}
