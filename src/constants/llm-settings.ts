export const LLM_SETTINGS_ROUTE = "/settings/llm";
export const LLM_SETTINGS_EDIT_PROFILE_QUERY_PARAM = "profile";

export function buildLlmSettingsRoute(profileName?: string | null) {
  if (!profileName) return LLM_SETTINGS_ROUTE;

  const params = new URLSearchParams({
    [LLM_SETTINGS_EDIT_PROFILE_QUERY_PARAM]: profileName,
  });
  return `${LLM_SETTINGS_ROUTE}?${params.toString()}`;
}
