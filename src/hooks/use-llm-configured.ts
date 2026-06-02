import { useSettings } from "#/hooks/query/use-settings";
import { useConfig } from "#/hooks/query/use-config";
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
   * True while settings/config are still resolving. Consumers should render
   * nothing in this state so a warning doesn't flash before data loads.
   */
  isLoading: boolean;
}

/**
 * Reports whether the active backend's agent has an LLM ready to run
 * conversations. Surfaces the gap left by the onboarding "Skip for now" path,
 * which persists no settings — leaving an OpenHands agent without an API key.
 */
export function useLlmConfigured(): LlmConfiguredResult {
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: config, isLoading: configLoading } = useConfig();

  const isAcpAgent = settings?.agent_settings?.agent_kind === "acp";
  const hasApiKey = settings?.llm_api_key_set === true;
  const llmSettingsHidden = isSettingsPageHidden(
    "/settings/llm",
    config?.feature_flags,
  );

  return {
    isConfigured: isAcpAgent || hasApiKey || llmSettingsHidden,
    isLoading: settingsLoading || configLoading,
  };
}
