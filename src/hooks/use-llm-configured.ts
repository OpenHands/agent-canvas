import { useSettings } from "#/hooks/query/use-settings";
import { useConfig } from "#/hooks/query/use-config";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { isSettingsPageHidden } from "#/utils/settings-utils";
import { LLM_SETTINGS_ROUTE } from "#/constants/llm-settings";

export const LLM_CONFIGURATION_ISSUES = {
  NOT_CONFIGURED: "not-configured",
  ACTIVE_PROFILE_MISSING_API_KEY: "active-profile-missing-api-key",
} as const;

type LlmConfigurationIssue =
  (typeof LLM_CONFIGURATION_ISSUES)[keyof typeof LLM_CONFIGURATION_ISSUES];

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
  /**
   * Specific recovery issue for the unconfigured state. Used by the UI to
   * distinguish a fresh setup gap from an active saved profile whose key is no
   * longer usable.
   */
  issue: LlmConfigurationIssue | null;
  activeProfileName: string | null;
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
  const { backend } = useActiveBackend();
  const isLocal = backend.kind === "local";

  const isAcpAgent = settings?.agent_settings?.agent_kind === "acp";
  const hasApiKey = settings?.llm_api_key_set === true;
  const activeProfile = profilesData?.profiles.find(
    (profile) => profile.name === profilesData.active_profile,
  );
  const hasActiveProfileApiKey = activeProfile?.api_key_set === true;
  const hasActiveProfileMissingApiKey =
    isLocal && Boolean(activeProfile) && activeProfile?.api_key_set === false;
  const llmSettingsHidden = isSettingsPageHidden(
    LLM_SETTINGS_ROUTE,
    config?.feature_flags,
  );

  // In local mode, profiles are the source of truth: a usable LLM must be
  // backed by an active profile that still exists and has a key. The raw
  // settings key can be a stale copy left behind by a deleted profile
  // (settings are not cleared on delete), so we don't count it here. Cloud
  // backends don't use profiles and keep the settings-key signal.
  const hasUsableLlm = isLocal ? hasActiveProfileApiKey : hasApiKey;

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
  const isConfigured = isAcpAgent || llmSettingsHidden || hasUsableLlm;
  const issue = isConfigured
    ? null
    : hasActiveProfileMissingApiKey
      ? LLM_CONFIGURATION_ISSUES.ACTIVE_PROFILE_MISSING_API_KEY
      : LLM_CONFIGURATION_ISSUES.NOT_CONFIGURED;

  return {
    isConfigured,
    isLoading:
      settingsIndeterminate || configIndeterminate || profilesIndeterminate,
    issue,
    activeProfileName: activeProfile?.name ?? null,
  };
}
