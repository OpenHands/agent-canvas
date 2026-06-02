import { usePostHog } from "posthog-js/react";
import { useSettings } from "./query/use-settings";
import { Provider } from "#/types/settings";

/**
 * Hook that provides tracking functions with automatic data collection
 * from available hooks (settings, etc.)
 */
export const useTracking = () => {
  const posthog = usePostHog();
  const { data: settings } = useSettings();

  // Common properties included in all tracking events
  const commonProperties = {
    current_url: window.location.href,
    user_email: settings?.email || settings?.git_user_email || null,
  };

  const trackLoginButtonClick = ({ provider }: { provider: Provider }) => {
    posthog.capture("login_button_clicked", {
      provider,
      ...commonProperties,
    });
  };

  const trackConversationCreated = ({
    hasRepository,
  }: {
    hasRepository: boolean;
  }) => {
    posthog.capture("conversation_created", {
      has_repository: hasRepository,
      ...commonProperties,
    });
  };

  const trackPushButtonClick = () => {
    posthog.capture("push_button_clicked", {
      ...commonProperties,
    });
  };

  const trackPullButtonClick = () => {
    posthog.capture("pull_button_clicked", {
      ...commonProperties,
    });
  };

  const trackCreatePrButtonClick = () => {
    posthog.capture("create_pr_button_clicked", {
      ...commonProperties,
    });
  };

  const trackUserSignupCompleted = () => {
    posthog.capture("user_signup_completed", {
      signup_timestamp: new Date().toISOString(),
      ...commonProperties,
    });
  };

  const trackPrebuiltAutomationEnabled = ({
    automationId,
    automationName,
    automationCategory,
  }: {
    automationId?: string;
    automationName: string;
    automationCategory?: string;
  }) => {
    posthog.capture("prebuilt_automation_enabled", {
      automation_id: automationId,
      automation_name: automationName,
      automation_category: automationCategory,
      ...commonProperties,
    });
  };

  const trackInitialQuerySubmitted = ({
    entryPoint,
    queryCharacterLength,
    replayJsonSize,
  }: {
    entryPoint: string;
    queryCharacterLength: number;
    replayJsonSize?: number;
  }) => {
    posthog.capture("initial_query_submitted", {
      entry_point: entryPoint,
      query_character_length: queryCharacterLength,
      replay_json_size: replayJsonSize,
      ...commonProperties,
    });
  };

  const trackUserMessageSent = ({
    sessionMessageCount,
    currentMessageLength,
  }: {
    sessionMessageCount: number;
    currentMessageLength: number;
  }) => {
    posthog.capture("user_message_sent", {
      session_message_count: sessionMessageCount,
      current_message_length: currentMessageLength,
      ...commonProperties,
    });
  };

  const trackDownloadVsCodeButtonClicked = () => {
    posthog.capture("download_via_vscode_button_clicked", {
      ...commonProperties,
    });
  };

  const trackSettingsSaved = ({
    llmModel,
    llmApiKeySet,
    searchApiKeySet,
    remoteRuntimeResourceFactor,
  }: {
    llmModel: unknown;
    llmApiKeySet: "SET" | "UNSET";
    searchApiKeySet: "SET" | "UNSET";
    remoteRuntimeResourceFactor?: unknown;
  }) => {
    posthog.capture("settings_saved", {
      LLM_MODEL: llmModel,
      LLM_API_KEY_SET: llmApiKeySet,
      SEARCH_API_KEY_SET: searchApiKeySet,
      REMOTE_RUNTIME_RESOURCE_FACTOR: remoteRuntimeResourceFactor,
      ...commonProperties,
    });
  };

  const trackMcpConfigUpdated = ({
    sseServersCount,
    stdioServersCount,
  }: {
    sseServersCount: number;
    stdioServersCount: number;
  }) => {
    posthog.capture("mcp_config_updated", {
      has_mcp_config: true,
      sse_servers_count: sseServersCount,
      stdio_servers_count: stdioServersCount,
      ...commonProperties,
    });
  };

  const trackDownloadTrajectoryButtonClicked = () => {
    posthog.capture("download_trajectory_button_clicked", {
      ...commonProperties,
    });
  };

  return {
    trackLoginButtonClick,
    trackConversationCreated,
    trackPushButtonClick,
    trackPullButtonClick,
    trackCreatePrButtonClick,
    trackUserSignupCompleted,
    trackPrebuiltAutomationEnabled,
    trackInitialQuerySubmitted,
    trackUserMessageSent,
    trackDownloadVsCodeButtonClicked,
    trackSettingsSaved,
    trackMcpConfigUpdated,
    trackDownloadTrajectoryButtonClicked,
  };
};
