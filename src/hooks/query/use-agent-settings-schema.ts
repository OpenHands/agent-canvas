import { useQuery } from "@tanstack/react-query";
import SettingsService from "#/api/settings-service/settings-service.api";
import { SettingsSchema } from "#/types/settings";
import { useIsAuthed } from "./use-is-authed";

const useSettingsSchema = (
  type: "agent" | "conversation",
  fallbackSchema?: SettingsSchema | null,
) => {
  const { data: userIsAuthenticated } = useIsAuthed();
  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ["settings-schema", type],
    queryFn:
      type === "conversation"
        ? SettingsService.getConversationSettingsSchema
        : SettingsService.getSettingsSchema,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    enabled: !fallbackSchema && !!userIsAuthenticated,
    meta: {
      disableToast: true,
    },
  });

  if (fallbackSchema) {
    return {
      data: fallbackSchema,
      error: null,
      isLoading: false,
      isFetching: false,
    };
  }

  return {
    data,
    error,
    isLoading,
    isFetching,
  };
};

export const useAgentSettingsSchema = (
  fallbackSchema?: SettingsSchema | null,
) => useSettingsSchema("agent", fallbackSchema);

export const useConversationSettingsSchema = (
  fallbackSchema?: SettingsSchema | null,
) => useSettingsSchema("conversation", fallbackSchema);
