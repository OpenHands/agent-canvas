import { useQuery } from "@tanstack/react-query";
import WorkRuntimeService from "#/api/work-runtime-service/work-runtime-service.api";
import { useWorkModeAvailability } from "#/hooks/use-work-mode-availability";

export const WORK_RUNTIME_HEALTH_QUERY_KEY = ["work-runtime-health"] as const;

export function useWorkRuntimeHealth() {
  const { workAllowed, workExecution } = useWorkModeAvailability();

  return useQuery({
    queryKey: [...WORK_RUNTIME_HEALTH_QUERY_KEY, workExecution],
    queryFn: () => WorkRuntimeService.checkHealth(),
    enabled: workAllowed && workExecution === "local",
    staleTime: 30 * 1000,
    retry: false,
  });
}
