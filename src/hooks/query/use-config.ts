import { useQuery } from "@tanstack/react-query";
import {
  isAgentServerUnavailableError,
  isAgentServerAuthError,
} from "#/api/agent-server-compatibility";
import OptionService from "#/api/option-service/option-service.api";
import { QUERY_KEYS, CONFIG_CACHE_OPTIONS } from "./query-keys";

interface UseConfigOptions {
  enabled?: boolean;
}

export const useConfig = (options?: UseConfigOptions) =>
  useQuery({
    queryKey: QUERY_KEYS.WEB_CLIENT_CONFIG,
    queryFn: OptionService.getConfig,
    retry: (failureCount, error) =>
      // Don't retry when the server is unreachable or when auth is required
      // (public mode 401) — both are terminal states that need user action.
      !isAgentServerUnavailableError(error) &&
      !isAgentServerAuthError(error) &&
      failureCount < 3,
    meta: { disableToast: true },
    ...CONFIG_CACHE_OPTIONS,
    enabled: options?.enabled,
  });
