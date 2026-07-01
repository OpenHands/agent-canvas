import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";
import {
  AGENT_PROFILES_QUERY_KEYS,
  SETTINGS_QUERY_KEYS,
} from "#/hooks/query/query-keys";

/**
 * Activate an agent profile by its stable UUID `id`. Activation is
 * pointer-only (it does NOT write agent_settings), but it changes the launch
 * default the backend resolves for new conversations, so the settings cache is
 * invalidated defensively alongside the profiles list.
 */
export function useActivateAgentProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profileId: string) =>
      AgentProfilesService.activateProfile(profileId),
    onSuccess: async () => {
      SettingsService.invalidateCache();
      await queryClient.invalidateQueries({
        queryKey: AGENT_PROFILES_QUERY_KEYS.all,
      });
      await queryClient.invalidateQueries({
        queryKey: SETTINGS_QUERY_KEYS.personal(),
      });
    },
    // Consumers handle errors with try-catch and manual toasts.
    meta: { disableToast: true },
  });
}
