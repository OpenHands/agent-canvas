import { useQuery } from "@tanstack/react-query";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import { CONFIG_CACHE_OPTIONS, LLM_PROFILES_QUERY_KEYS } from "./query-keys";

export { LLM_PROFILES_QUERY_KEYS };

export function useLlmProfiles() {
  return useQuery({
    queryKey: LLM_PROFILES_QUERY_KEYS.all,
    queryFn: ProfilesService.listProfiles,
    ...CONFIG_CACHE_OPTIONS,
    meta: { disableToast: true },
  });
}
