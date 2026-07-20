import { useSettings } from "./query/use-settings";
import { Provider } from "#/types/settings";
import type { BackendKind } from "#/api/backend-registry/types";
import type { WorkspaceMode } from "#/api/conversation-metadata-store";
import type { CloudConnectionSource } from "#/services/cloud-funnel-analytics";
import { trackEvent } from "#/services/telemetry";

/**
 * Hook that provides tracking functions with automatic data collection
 * from available hooks (settings, etc.)
 *
 * All events require explicit user consent. The shared PostHog client enforces
 * the canonical consent configured by telemetry.ts; this hook must not gate on
 * backend settings because they can be stale while a backend changes.
 */
export const useTracking = () => {
  const { data: settings } = useSettings();

  // Common properties included in all tracking events
  const commonProperties = {
    current_url: window.location.href,
    user_email: settings?.email || settings?.git_user_email || null,
  };

  /**
   * PostHog enforces the canonical consent state configured by telemetry.ts.
   * Backend settings are not a capture gate because they can be stale while a
   * backend is being added or switched.
   */
  const track = (event: string, properties: Record<string, unknown> = {}) => {
    void trackEvent(event, { ...properties, ...commonProperties });
  };

  const trackLoginButtonClick = ({ provider }: { provider: Provider }) => {
    track("login_button_clicked", { provider });
  };

  const trackConversationCreated = ({
    conversationId,
    taskId,
    hasRepository,
    gitProvider,
    hasWorkspace,
    workspaceMode,
    hasInitialQuery,
    agentType,
    hasParentConversation,
    entryPoint,
  }: {
    conversationId: string;
    taskId?: string;
    hasRepository: boolean;
    gitProvider?: Provider;
    hasWorkspace: boolean;
    workspaceMode?: WorkspaceMode;
    hasInitialQuery: boolean;
    agentType?: "default" | "plan";
    hasParentConversation: boolean;
    entryPoint?: string;
  }) => {
    track("conversation_created", {
      conversation_id: conversationId,
      task_id: taskId,
      is_start_task: conversationId.startsWith("task-"),
      has_repository: hasRepository,
      git_provider: gitProvider,
      has_workspace: hasWorkspace,
      workspace_mode: workspaceMode,
      has_initial_query: hasInitialQuery,
      agent_type: agentType,
      has_parent_conversation: hasParentConversation,
      entry_point: entryPoint,
    });
  };

  const trackPushButtonClick = () => {
    track("push_button_clicked");
  };

  const trackPullButtonClick = () => {
    track("pull_button_clicked");
  };

  const trackCreatePrButtonClick = () => {
    track("create_pr_button_clicked");
  };

  const trackUserSignupCompleted = () => {
    track("user_signup_completed", {
      signup_timestamp: new Date().toISOString(),
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
    track("prebuilt_automation_enabled", {
      automation_id: automationId,
      automation_name: automationName,
      automation_category: automationCategory,
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
    track("initial_query_submitted", {
      entry_point: entryPoint,
      query_character_length: queryCharacterLength,
      replay_json_size: replayJsonSize,
    });
  };

  const trackUserMessageSent = ({
    sessionMessageCount,
    currentMessageLength,
  }: {
    sessionMessageCount: number;
    currentMessageLength: number;
  }) => {
    track("user_message_sent", {
      session_message_count: sessionMessageCount,
      current_message_length: currentMessageLength,
    });
  };

  const trackDownloadVsCodeButtonClicked = () => {
    track("download_via_vscode_button_clicked");
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
    track("settings_saved", {
      LLM_MODEL: llmModel,
      LLM_API_KEY_SET: llmApiKeySet,
      SEARCH_API_KEY_SET: searchApiKeySet,
      REMOTE_RUNTIME_RESOURCE_FACTOR: remoteRuntimeResourceFactor,
    });
  };

  const trackMcpConfigUpdated = ({
    sseServersCount,
    stdioServersCount,
  }: {
    sseServersCount: number;
    stdioServersCount: number;
  }) => {
    track("mcp_config_updated", {
      has_mcp_config: true,
      sse_servers_count: sseServersCount,
      stdio_servers_count: stdioServersCount,
    });
  };

  const trackDownloadTrajectoryButtonClicked = () => {
    track("download_trajectory_button_clicked");
  };

  const trackConversationExported = (format: "markdown" | "html") => {
    track("conversation_exported", { format });
  };

  const trackAutomationCreated = ({
    backendKind,
  }: {
    backendKind: BackendKind;
  }) => {
    track("automation_created", { backend_kind: backendKind });
  };

  const trackAutomationExecuted = ({
    backendKind,
  }: {
    backendKind: BackendKind;
  }) => {
    track("automation_executed", { backend_kind: backendKind });
  };

  const trackAutomationDeleted = ({
    backendKind,
  }: {
    backendKind: BackendKind;
  }) => {
    track("automation_deleted", { backend_kind: backendKind });
  };

  const trackAutomationDeactivated = ({
    backendKind,
  }: {
    backendKind: BackendKind;
  }) => {
    track("automation_deactivated", { backend_kind: backendKind });
  };

  const trackAutomationEdited = ({
    backendKind,
  }: {
    backendKind: BackendKind;
  }) => {
    track("automation_edited", { backend_kind: backendKind });
  };

  const trackAutomationExported = ({
    backendKind,
  }: {
    backendKind: BackendKind;
  }) => {
    track("automation_exported", { backend_kind: backendKind });
  };

  const trackAutomationImported = ({
    backendKind,
  }: {
    backendKind: BackendKind;
  }) => {
    track("automation_imported", { backend_kind: backendKind });
  };

  const trackBackendAdded = ({
    backendKind,
    connectionMethod,
    isOpenhandsCloud,
    isCustomHost,
    hasApiKey,
    source,
  }: {
    backendKind: BackendKind;
    connectionMethod: "manual" | "cloud_login";
    isOpenhandsCloud: boolean;
    isCustomHost: boolean;
    hasApiKey: boolean;
    source?: CloudConnectionSource;
  }) => {
    track("backend_added", {
      backend_kind: backendKind,
      connection_method: connectionMethod,
      is_openhands_cloud: isOpenhandsCloud,
      is_custom_host: isCustomHost,
      has_api_key: hasApiKey,
      source,
    });
  };

  const trackOnboardingStarted = () => {
    track("onboarding_started");
  };

  const trackOnboardingStepViewed = ({
    step,
    stepIndex,
    totalSteps,
    agent,
  }: {
    step: string;
    stepIndex: number;
    totalSteps: number;
    agent: string;
  }) => {
    track("onboarding_step_viewed", {
      step,
      step_index: stepIndex,
      total_steps: totalSteps,
      agent,
    });
  };

  const trackOnboardingCompleted = ({ agent }: { agent: string }) => {
    track("onboarding_completed", { agent });
  };

  const trackOnboardingSkipped = ({
    step,
    stepIndex,
    totalSteps,
    agent,
  }: {
    step: string;
    stepIndex: number;
    totalSteps: number;
    agent: string;
  }) => {
    track("onboarding_skipped", {
      step,
      step_index: stepIndex,
      total_steps: totalSteps,
      agent,
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
    trackConversationExported,
    trackAutomationCreated,
    trackAutomationExecuted,
    trackAutomationDeleted,
    trackAutomationDeactivated,
    trackAutomationEdited,
    trackAutomationExported,
    trackAutomationImported,
    trackBackendAdded,
    trackOnboardingStarted,
    trackOnboardingStepViewed,
    trackOnboardingCompleted,
    trackOnboardingSkipped,
  };
};
