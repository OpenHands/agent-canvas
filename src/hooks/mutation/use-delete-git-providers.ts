import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SecretsService } from "#/api/secrets-service";

export const useDeleteGitProviders = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => SecretsService.deleteGitProviders(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["settings", "personal"],
      });
    },
    meta: {
      disableToast: true,
    },
  });
};
