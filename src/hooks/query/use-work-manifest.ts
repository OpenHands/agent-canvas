import { useQuery } from "@tanstack/react-query";
import WorkRuntimeService from "#/api/work-runtime-service/work-runtime-service.api";
import { useWorkModeAvailability } from "#/hooks/use-work-mode-availability";

export const WORK_MANIFEST_QUERY_KEY = ["work-manifest"] as const;

export function useWorkManifest() {
  const { workAllowed, workExecution } = useWorkModeAvailability();

  return useQuery({
    queryKey: [...WORK_MANIFEST_QUERY_KEY, workExecution],
    queryFn: () => WorkRuntimeService.getManifest(),
    enabled: workAllowed && workExecution === "local",
    staleTime: 10 * 1000,
  });
}
