import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "posthog-js/react";
import { SessionClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { SETTINGS_QUERY_KEYS } from "#/hooks/query/query-keys";

export const useLogout = () => {
  const posthog = usePostHog();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await new SessionClient(
        getAgentServerClientOptions(),
      ).unsetProviderTokens();
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["tasks"] });
      queryClient.removeQueries({ queryKey: SETTINGS_QUERY_KEYS.all });
      queryClient.removeQueries({ queryKey: ["user"] });
      queryClient.removeQueries({ queryKey: ["secrets"] });
      posthog.reset();
      window.location.reload();
    },
  });
};
