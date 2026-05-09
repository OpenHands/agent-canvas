import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { AUTOMATION_DETAIL_QUERY_KEY } from "./use-automation-detail";

export const AUTOMATIONS_QUERY_KEY = ["automations"] as const;

interface UseAutomationsOptions {
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

export function useAutomations(options: UseAutomationsOptions = {}) {
  const { limit = 50, offset = 0, enabled = true } = options;
  const active = useActiveBackend();
  return useQuery({
    queryKey: [
      ...AUTOMATIONS_QUERY_KEY,
      { limit, offset },
      active.backend.id,
      active.orgId,
    ],
    queryFn: () => AutomationService.getAutomations(limit, offset),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useToggleAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      AutomationService.toggleAutomation(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: AUTOMATION_DETAIL_QUERY_KEY });
    },
  });
}

export function useDeleteAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AutomationService.deleteAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
    },
  });
}
