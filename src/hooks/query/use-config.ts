import { useQuery } from "@tanstack/react-query";
import {
  isAgentServerAuthError,
  isAgentServerUnavailableError,
  isTransientAgentServerError,
} from "#/api/agent-server-compatibility";
import OptionService from "#/api/option-service/option-service.api";
import { QUERY_KEYS, CONFIG_CACHE_OPTIONS } from "./query-keys";

const CONFIG_TRANSIENT_RETRY_LIMIT = 3;

interface UseConfigOptions {
  enabled?: boolean;
}

export const useConfig = (options?: UseConfigOptions) =>
  useQuery({
    queryKey: QUERY_KEYS.WEB_CLIENT_CONFIG,
    queryFn: OptionService.getConfig,
    retry: (failureCount, error) => {
      if (isTransientAgentServerError(error)) {
        return failureCount < CONFIG_TRANSIENT_RETRY_LIMIT;
      }
      if (
        isAgentServerAuthError(error) ||
        isAgentServerUnavailableError(error)
      ) {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
    meta: { disableToast: true },
    ...CONFIG_CACHE_OPTIONS,
    enabled: options?.enabled,
  });
