import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { AGENT_PROFILES_QUERY_KEYS } from "#/hooks/query/query-keys";

export function useRenameAgentProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) =>
      AgentProfilesService.renameProfile(name, newName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: AGENT_PROFILES_QUERY_KEYS.all,
      });
    },
    // Consumers handle errors (409 when newName already exists).
    meta: { disableToast: true },
  });
}
