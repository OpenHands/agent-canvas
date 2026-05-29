import { useQuery } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  AutomationRunStatus,
  type AutomationRunsResponse,
} from "#/types/automation";

export const AUTOMATION_DETAIL_QUERY_KEY = ["automation-detail"] as const;
export const AUTOMATION_RUNS_QUERY_KEY = ["automation-runs"] as const;

const AUTOMATION_DETAIL_REFETCH_INTERVAL_MS = 45_000;
const AUTOMATION_RUNS_REFETCH_INTERVAL_MS = 20_000;

interface UseAutomationDetailOptions {
  id: string;
  enabled?: boolean;
}

export function useAutomationDetail(options: UseAutomationDetailOptions) {
  const { id, enabled = true } = options;
  const active = useActiveBackend();
  const isActive = !!id && enabled;
  return useQuery({
    queryKey: [
      ...AUTOMATION_DETAIL_QUERY_KEY,
      id,
      active.backend.id,
      active.orgId,
    ],
    queryFn: () => AutomationService.getAutomation(id),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: isActive ? AUTOMATION_DETAIL_REFETCH_INTERVAL_MS : false,
    enabled: isActive,
  });
}

interface UseAutomationRunsOptions {
  id: string;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

export function useAutomationRuns(options: UseAutomationRunsOptions) {
  const { id, limit = 20, offset = 0, enabled = true } = options;
  const active = useActiveBackend();
  const isActive = !!id && enabled;
  return useQuery({
    queryKey: [
      ...AUTOMATION_RUNS_QUERY_KEY,
      id,
      { limit, offset },
      active.backend.id,
      active.orgId,
    ],
    queryFn: () => AutomationService.getAutomationRuns(id, limit, offset),
  });
}
