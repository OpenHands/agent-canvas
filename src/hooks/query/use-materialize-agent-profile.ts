import { useQuery } from "@tanstack/react-query";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { AGENT_PROFILES_QUERY_KEYS } from "./query-keys";

interface UseMaterializeAgentProfileOptions {
  enabled?: boolean;
}

/**
 * Dry-run resolve of a *stored* AgentProfile — the server resolves its
 * `llm_profile_ref` / `mcp_server_refs` and reports what it would launch with
 * (redacted) plus any dangling refs / missing credentials. Powers the editor's
 * "What this agent will do" overview.
 *
 * Reflects the last *saved* revision (materialize takes a name, not a body), so
 * the editor only enables this in edit mode and refetches after a save.
 */
export function useMaterializeAgentProfile(
  name: string | null,
  options: UseMaterializeAgentProfileOptions = {},
) {
  const { backend, orgId } = useActiveBackend();

  return useQuery({
    // Backend identity isolates the cache across backend/org switches.
    queryKey: [
      ...AGENT_PROFILES_QUERY_KEYS.materialize(name ?? ""),
      backend.id,
      orgId,
    ],
    queryFn: () => AgentProfilesService.materializeProfile(name as string),
    enabled: (options.enabled ?? true) && !!name,
    // The resolved config is cheap and changes only on save; refetch on demand.
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
    retry: false,
    meta: { disableToast: true },
  });
}
