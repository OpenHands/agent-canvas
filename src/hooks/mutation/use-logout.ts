import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "posthog-js/react";
import { createSessionClient } from "#/api/typescript-client";
import { SETTINGS_QUERY_KEYS } from "#/hooks/query/query-keys";

export const useLogout = () => {
  const posthog = usePostHog();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await createSessionClient().unsetProviderTokens();
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
