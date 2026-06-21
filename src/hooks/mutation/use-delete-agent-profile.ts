import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { AGENT_PROFILES_QUERY_KEYS } from "#/hooks/query/query-keys";

export function useDeleteAgentProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    // Delete is idempotent server-side (missing name resolves 200, not 404).
    mutationFn: (name: string) => AgentProfilesService.deleteProfile(name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: AGENT_PROFILES_QUERY_KEYS.all,
      });
    },
    meta: { disableToast: true },
  });
}
