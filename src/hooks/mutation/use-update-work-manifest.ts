import { useMutation, useQueryClient } from "@tanstack/react-query";
import WorkRuntimeService from "#/api/work-runtime-service/work-runtime-service.api";
import type { WorkManifest } from "#/types/work-manifest";
import { WORK_MANIFEST_QUERY_KEY } from "#/hooks/query/use-work-manifest";

export function useUpdateWorkManifest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (manifest: WorkManifest) =>
      WorkRuntimeService.updateManifest(manifest),
    onSuccess: (manifest) => {
      queryClient.setQueryData(WORK_MANIFEST_QUERY_KEY, manifest);
      queryClient.invalidateQueries({ queryKey: WORK_MANIFEST_QUERY_KEY });
    },
  });
}
