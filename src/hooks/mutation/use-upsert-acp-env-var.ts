import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AcpEnvService } from "#/api/acp-env-service";
import { ACP_ENV_QUERY_KEYS } from "#/hooks/query/query-keys";

export const useUpsertAcpEnvVar = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, value }: { name: string; value: string }) =>
      AcpEnvService.upsert(name, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACP_ENV_QUERY_KEYS.all });
    },
  });
};
