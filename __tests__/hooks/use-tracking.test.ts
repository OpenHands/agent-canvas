import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
let posthogMock: { capture: typeof captureMock } | undefined = {
  capture: captureMock,
};

vi.mock("posthog-js/react", () => ({
  usePostHog: () => posthogMock,
}));

const useSettingsMock = vi.fn();
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));

import { useTracking } from "#/hooks/use-tracking";

const TEST_EMAIL = "user@example.com";
// Resolved at test-run time so it matches whatever URL jsdom is configured
// with in the current environment (varies between local and CI).
let COMMON: { current_url: string; user_email: string };

describe("useTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posthogMock = { capture: captureMock };
    useSettingsMock.mockReturnValue({
      data: { email: TEST_EMAIL, user_consents_to_analytics: true },
    });
    COMMON = {
      current_url: window.location.href,
      user_email: TEST_EMAIL,
    };
  });

  const getTracking = () => renderHook(() => useTracking()).result.current;

  describe("trackLoginButtonClick", () => {
    it("captures login_button_clicked with provider and commonProperties", () => {
      getTracking().trackLoginButtonClick({ provider: "github" });

      expect(captureMock).toHaveBeenCalledWith("login_button_clicked", {
        provider: "github",
        ...COMMON,
      });
    });
  });

  describe("trackConversationCreated", () => {
    it("captures conversation_created with has_repository flag", () => {
      getTracking().trackConversationCreated({ hasRepository: true });

      expect(captureMock).toHaveBeenCalledWith("conversation_created", {
        has_repository: true,
        ...COMMON,
      });
    });
  });

  describe("trackPushButtonClick", () => {
    it("captures push_button_clicked with commonProperties", () => {
      getTracking().trackPushButtonClick();

      expect(captureMock).toHaveBeenCalledWith(
        "push_button_clicked",
        expect.objectContaining(COMMON),
      );
    });
  });

  describe("trackPullButtonClick", () => {
    it("captures pull_button_clicked with commonProperties", () => {
      getTracking().trackPullButtonClick();

      expect(captureMock).toHaveBeenCalledWith(
        "pull_button_clicked",
        expect.objectContaining(COMMON),
      );
    });
  });

  describe("trackCreatePrButtonClick", () => {
    it("captures create_pr_button_clicked with commonProperties", () => {
      getTracking().trackCreatePrButtonClick();

      expect(captureMock).toHaveBeenCalledWith(
        "create_pr_button_clicked",
        expect.objectContaining(COMMON),
      );
    });
  });

  describe("trackUserSignupCompleted", () => {
    it("captures user_signup_completed with signup_timestamp and commonProperties", () => {
      getTracking().trackUserSignupCompleted();

      expect(captureMock).toHaveBeenCalledWith(
        "user_signup_completed",
        expect.objectContaining({
          signup_timestamp: expect.any(String),
          ...COMMON,
        }),
      );
    });
  });

  describe("trackPrebuiltAutomationEnabled", () => {
    it("captures prebuilt_automation_enabled with all fields", () => {
      getTracking().trackPrebuiltAutomationEnabled({
        automationId: "auto-1",
        automationName: "My Automation",
        automationCategory: "CI",
      });

      expect(captureMock).toHaveBeenCalledWith("prebuilt_automation_enabled", {
        automation_id: "auto-1",
        automation_name: "My Automation",
        automation_category: "CI",
        ...COMMON,
      });
    });

    it("sends undefined fields when optional args are omitted", () => {
      getTracking().trackPrebuiltAutomationEnabled({
        automationName: "Minimal",
      });

      expect(captureMock).toHaveBeenCalledWith(
        "prebuilt_automation_enabled",
        expect.objectContaining({
          automation_name: "Minimal",
          automation_id: undefined,
          automation_category: undefined,
        }),
      );
    });
  });

  describe("trackInitialQuerySubmitted", () => {
    it("captures initial_query_submitted with all properties", () => {
      getTracking().trackInitialQuerySubmitted({
        entryPoint: "github",
        queryCharacterLength: 42,
        replayJsonSize: 100,
      });

      expect(captureMock).toHaveBeenCalledWith("initial_query_submitted", {
        entry_point: "github",
        query_character_length: 42,
        replay_json_size: 100,
        ...COMMON,
      });
    });

    it("sends undefined replayJsonSize when omitted", () => {
      getTracking().trackInitialQuerySubmitted({
        entryPoint: "direct",
        queryCharacterLength: 10,
      });

      expect(captureMock).toHaveBeenCalledWith(
        "initial_query_submitted",
        expect.objectContaining({ replay_json_size: undefined }),
      );
    });
  });

  describe("trackUserMessageSent", () => {
    it("captures user_message_sent with message counts", () => {
      getTracking().trackUserMessageSent({
        sessionMessageCount: 5,
        currentMessageLength: 120,
      });

      expect(captureMock).toHaveBeenCalledWith("user_message_sent", {
        session_message_count: 5,
        current_message_length: 120,
        ...COMMON,
      });
    });
  });

  describe("trackDownloadVsCodeButtonClicked", () => {
    it("captures download_via_vscode_button_clicked with commonProperties", () => {
      getTracking().trackDownloadVsCodeButtonClicked();

      expect(captureMock).toHaveBeenCalledWith(
        "download_via_vscode_button_clicked",
        expect.objectContaining(COMMON),
      );
    });
  });

  describe("trackSettingsSaved", () => {
    it("captures settings_saved with all properties using SCREAMING_SNAKE_CASE keys", () => {
      getTracking().trackSettingsSaved({
        llmModel: "gpt-4",
        llmApiKeySet: "SET",
        searchApiKeySet: "UNSET",
        remoteRuntimeResourceFactor: 2,
      });

      expect(captureMock).toHaveBeenCalledWith("settings_saved", {
        LLM_MODEL: "gpt-4",
        LLM_API_KEY_SET: "SET",
        SEARCH_API_KEY_SET: "UNSET",
        REMOTE_RUNTIME_RESOURCE_FACTOR: 2,
        ...COMMON,
      });
    });
  });

  describe("trackMcpConfigUpdated", () => {
    it("captures mcp_config_updated with server counts and has_mcp_config: true", () => {
      getTracking().trackMcpConfigUpdated({
        sseServersCount: 2,
        stdioServersCount: 1,
      });

      expect(captureMock).toHaveBeenCalledWith("mcp_config_updated", {
        has_mcp_config: true,
        sse_servers_count: 2,
        stdio_servers_count: 1,
        ...COMMON,
      });
    });
  });

  describe("trackDownloadTrajectoryButtonClicked", () => {
    it("captures download_trajectory_button_clicked with commonProperties", () => {
      getTracking().trackDownloadTrajectoryButtonClicked();

      expect(captureMock).toHaveBeenCalledWith(
        "download_trajectory_button_clicked",
        expect.objectContaining(COMMON),
      );
    });
  });

  describe("trackBackendAdded", () => {
    it("captures backend_added with coarse, non-sensitive backend metadata", () => {
      getTracking().trackBackendAdded({
        backendKind: "cloud",
        connectionMethod: "cloud_login",
        isOpenhandsCloud: true,
        isCustomHost: false,
        hasApiKey: true,
        source: "add_backend_modal",
      });

      expect(captureMock).toHaveBeenCalledWith("backend_added", {
        backend_kind: "cloud",
        connection_method: "cloud_login",
        is_openhands_cloud: true,
        is_custom_host: false,
        has_api_key: true,
        source: "add_backend_modal",
        ...COMMON,
      });
    });
  });

  describe("consent gate", () => {
    it("does not capture when posthog is not initialized", () => {
      posthogMock = undefined;

      getTracking().trackPushButtonClick();

      expect(captureMock).not.toHaveBeenCalled();
    });

    it("does not capture when user_consents_to_analytics is false", () => {
      useSettingsMock.mockReturnValue({
        data: { email: TEST_EMAIL, user_consents_to_analytics: false },
      });

      getTracking().trackPushButtonClick();

      expect(captureMock).not.toHaveBeenCalled();
    });

    it("does not capture when user_consents_to_analytics is null", () => {
      useSettingsMock.mockReturnValue({
        data: { email: TEST_EMAIL, user_consents_to_analytics: null },
      });

      getTracking().trackPushButtonClick();

      expect(captureMock).not.toHaveBeenCalled();
    });

    it("does not capture when settings are still loading", () => {
      useSettingsMock.mockReturnValue({ data: undefined });

      getTracking().trackPushButtonClick();

      expect(captureMock).not.toHaveBeenCalled();
    });
  });

  describe("commonProperties", () => {
    it("uses git_user_email as fallback when email is absent", () => {
      useSettingsMock.mockReturnValue({
        data: {
          email: null,
          git_user_email: "git@example.com",
          user_consents_to_analytics: true,
        },
      });

      getTracking().trackPushButtonClick();

      expect(captureMock).toHaveBeenCalledWith(
        "push_button_clicked",
        expect.objectContaining({ user_email: "git@example.com" }),
      );
    });

    it("sends null user_email when no email fields are present", () => {
      useSettingsMock.mockReturnValue({
        data: {
          email: null,
          git_user_email: null,
          user_consents_to_analytics: true,
        },
      });

      getTracking().trackPushButtonClick();

      expect(captureMock).toHaveBeenCalledWith(
        "push_button_clicked",
        expect.objectContaining({ user_email: null }),
      );
    });
  });
});
