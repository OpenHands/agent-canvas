import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SecretsService } from "#/api/secrets-service";
import { Provider, ProviderToken } from "#/types/settings";
import { useTracking } from "#/hooks/use-tracking";
import { SETTINGS_QUERY_KEYS } from "#/hooks/query/query-keys";

export const useAddGitProviders = () => {
  const queryClient = useQueryClient();
  const { trackGitProviderConnected } = useTracking();

  return useMutation({
    mutationFn: ({
      providers,
    }: {
      providers: Partial<Record<Provider, ProviderToken>>;
    }) => SecretsService.addGitProvider(providers),
    onSuccess: async (_, { providers }) => {
      const connectedProviders = Object.entries(providers)
        .filter(([, value]) => value?.token && value.token.trim() !== "")
        .map(([key]) => key);

      if (connectedProviders.length > 0) {
        trackGitProviderConnected({
          providers: connectedProviders,
        });
      }

      await queryClient.invalidateQueries({
        queryKey: SETTINGS_QUERY_KEYS.personal(),
      });
    },
    meta: {
      disableToast: true,
    },
  });
};
