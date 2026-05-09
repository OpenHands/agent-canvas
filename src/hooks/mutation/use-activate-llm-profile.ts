import { useMutation, useQueryClient } from "@tanstack/react-query";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";

export function useActivateLlmProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => ProfilesService.activateProfile(name),
    onSuccess: () => {
      // Invalidate profiles list to refresh active_profile
      queryClient.invalidateQueries({ queryKey: ["llm-profiles"] });
      // Also invalidate settings since activating a profile changes agent_settings.llm
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      // Invalidate the SettingsService internal cache so getSettingsForConversation
      // fetches fresh settings with the newly activated profile's LLM config
      SettingsService.invalidateCache();
    },
  });
}
