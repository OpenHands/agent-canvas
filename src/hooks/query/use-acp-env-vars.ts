import { useQuery } from "@tanstack/react-query";
import { AcpEnvService } from "#/api/acp-env-service";
import { ACP_ENV_QUERY_KEYS, CONFIG_CACHE_OPTIONS } from "./query-keys";

export const useAcpEnvVars = (enabled: boolean = true) =>
  useQuery({
    queryKey: ACP_ENV_QUERY_KEYS.all,
    queryFn: AcpEnvService.list,
    enabled,
    ...CONFIG_CACHE_OPTIONS,
  });
