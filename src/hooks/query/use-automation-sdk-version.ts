import { useQuery } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import { isNoBackend } from "#/api/backend-registry/active-store";
import { useActiveBackend } from "#/contexts/active-backend-context";

export const AUTOMATION_SDK_VERSION_QUERY_KEY = [
  "automation-sdk-version",
] as const;

const AUTOMATION_SDK_VERSION_CACHE_TIME_MS = 60 * 60 * 1000;

export function useAutomationSdkVersion() {
  const active = useActiveBackend();
  const { backend } = active;

  return useQuery({
    queryKey: [
      ...AUTOMATION_SDK_VERSION_QUERY_KEY,
      backend.id,
      backend.kind,
      backend.host,
      active.orgId,
    ],
    queryFn: () => AutomationService.getSdkVersion(),
    enabled: !isNoBackend(backend),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: AUTOMATION_SDK_VERSION_CACHE_TIME_MS,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
