import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { AGENT_PROFILES_QUERY_KEYS } from "#/hooks/query/query-keys";

/**
 * Activate an agent profile by its stable UUID `id`. Pointer-only — the backend
 * records `active_agent_profile_id` but does NOT write `agent_settings` (the
 * chat-input picker in #3727 consumes the pointer + `launched_profile`).
 */
export function useActivateAgentProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profileId: string) =>
      AgentProfilesService.activateProfile(profileId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: AGENT_PROFILES_QUERY_KEYS.all,
      });
    },
    meta: { disableToast: true },
  });
}
