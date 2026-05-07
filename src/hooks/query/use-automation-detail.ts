import { useQuery } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";

export const AUTOMATION_DETAIL_QUERY_KEY = ["automation-detail"] as const;
export const AUTOMATION_RUNS_QUERY_KEY = ["automation-runs"] as const;

export function useAutomationDetail(id: string) {
  return useQuery({
    queryKey: [...AUTOMATION_DETAIL_QUERY_KEY, id],
    queryFn: () => AutomationService.getAutomation(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });
}

export function useAutomationRuns(id: string, limit = 20, offset = 0) {
  return useQuery({
    queryKey: [...AUTOMATION_RUNS_QUERY_KEY, id, { limit, offset }],
    queryFn: () => AutomationService.getAutomationRuns(id, limit, offset),
    staleTime: 60 * 1000,
    enabled: !!id,
  });
}
