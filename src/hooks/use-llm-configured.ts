import { useSettings } from "#/hooks/query/use-settings";
import { useConfig } from "#/hooks/query/use-config";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { isSettingsPageHidden } from "#/utils/settings-utils";

interface LlmConfiguredResult {
  /**
   * True when the active backend's agent has a usable LLM:
   * - ACP agents own their LLM via a subprocess, so they never need a key.
   * - OpenHands agents are ready only once an LLM API key has been saved.
   * - When the LLM settings page is hidden by a feature flag there is no
   *   place to finish setup, so we treat the LLM as configured to avoid
   *   surfacing an actionless warning.
   */
  isConfigured: boolean;
  /**
   * True while the configured/unconfigured state is indeterminate — either
   * settings/config are still resolving, or a fetch failed and left us with no
   * data to decide from. Consumers should render nothing in this state so a
   * warning doesn't flash before data loads or on a transient network error.
   */
  isLoading: boolean;
}

/**
 * Reports whether the active backend's agent has an LLM ready to run
 * conversations. Surfaces the gap left by the onboarding "Skip for now" path,
 * which persists no settings — leaving an OpenHands agent without an API key.
 */
export function useLlmConfigured(): LlmConfiguredResult {
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
  } = useSettings();
  const {
    data: config,
    isLoading: configLoading,
    isError: configError,
  } = useConfig();
  const {
    data: profilesData,
    isLoading: profilesLoading,
    isError: profilesError,
  } = useLlmProfiles();

  const isAcpAgent = settings?.agent_settings?.agent_kind === "acp";
  const hasApiKey = settings?.llm_api_key_set === true;
  const activeProfile = profilesData?.profiles.find(
    (profile) => profile.name === profilesData.active_profile,
  );
  const hasActiveProfileApiKey = activeProfile?.api_key_set === true;
  const llmSettingsHidden = isSettingsPageHidden(
    "/settings/llm",
    config?.feature_flags,
  );

  // Treat a fetch failure as indeterminate (same as loading) only when it
  // leaves us with no data to decide from — otherwise a transient network
  // error would surface the banner with the same urgency as a genuinely
  // missing API key. A settings 404 is deliberately not covered here:
  // `useSettings` maps it to DEFAULT_SETTINGS (no key, OpenHands agent) while
  // keeping `isError` set, and that is exactly the new-user / "Skip for now"
  // state the banner exists to catch — so we keep deciding from that data.
  const settingsIndeterminate = settingsLoading || (settingsError && !settings);
  const configIndeterminate = configLoading || (configError && !config);
  const profilesIndeterminate =
    profilesLoading || (profilesError && !profilesData);

  return {
    isConfigured:
      isAcpAgent || hasApiKey || hasActiveProfileApiKey || llmSettingsHidden,
    isLoading:
      settingsIndeterminate || configIndeterminate || profilesIndeterminate,
  };
}
