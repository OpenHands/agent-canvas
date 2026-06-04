import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import VerificationSettingsScreen from "#/routes/verification-settings";
import { Settings } from "#/types/settings";

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
      ...overrides.agent_settings,
    },
    conversation_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.conversation_settings,
      ...overrides.conversation_settings,
    },
    agent_settings_schema:
      overrides.agent_settings_schema ??
      MOCK_DEFAULT_USER_SETTINGS.agent_settings_schema,
    conversation_settings_schema:
      overrides.conversation_settings_schema ??
      MOCK_DEFAULT_USER_SETTINGS.conversation_settings_schema,
  };
}

function renderVerificationSettingsScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<VerificationSettingsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("VerificationSettingsScreen", () => {
  it("renders critic controls in basic view", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          verification: {
            critic_enabled: true,
            enable_iterative_refinement: false,
          },
        },
      }),
    );

    renderVerificationSettingsScreen();

    await screen.findByTestId("verification-settings-screen");

    // Critical-prominence fields are visible in the basic view
    expect(
      screen.getByTestId("sdk-settings-verification.critic_enabled"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(
        "sdk-settings-verification.enable_iterative_refinement",
      ),
    ).toBeInTheDocument();

    // The critic LLM API key is optional because the SDK falls back to the
    // active LLM API key when this field is blank. It is still surfaced
    // alongside the other critical-prominence fields when the critic is on.
    const apiKeyInput = screen.getByTestId(
      "sdk-settings-verification.critic_api_key",
    );
    expect(apiKeyInput).toBeInTheDocument();
    expect(apiKeyInput).toHaveAttribute("type", "password");
    expect(apiKeyInput).not.toBeRequired();

    // The accompanying help link points users at OpenHands Cloud, mirroring
    // the hint we already show under the LLM provider's API key field.
    const helpLink = screen.getByTestId(
      "help-link-verification.critic_api_key",
    );
    expect(helpLink).toBeInTheDocument();
    expect(
      helpLink.querySelector('a[href="https://app.all-hands.dev/settings/api-keys"]'),
    ).not.toBeNull();

    // Major-prominence fields (confirmation_mode) are hidden in basic view
    expect(
      screen.queryByTestId("sdk-settings-confirmation_mode"),
    ).not.toBeInTheDocument();
  });

  it("hides the critic API key field when the critic is disabled", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          verification: {
            critic_enabled: false,
            enable_iterative_refinement: false,
          },
        },
      }),
    );

    renderVerificationSettingsScreen();

    await screen.findByTestId("verification-settings-screen");

    expect(
      screen.queryByTestId("sdk-settings-verification.critic_api_key"),
    ).not.toBeInTheDocument();
  });

  it("shows confirmation controls in the advanced view", async () => {
    // Set confirmation_mode to true so inferInitialView picks "advanced"
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        conversation_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.conversation_settings,
          confirmation_mode: true,
        },
      }),
    );

    renderVerificationSettingsScreen();

    await screen.findByTestId("verification-settings-screen");

    // Confirmation mode (major prominence) should be visible
    expect(
      screen.getByTestId("sdk-settings-confirmation_mode"),
    ).toBeInTheDocument();
    // Security analyzer depends on confirmation_mode being true
    expect(
      screen.getByTestId("sdk-settings-security_analyzer"),
    ).toBeInTheDocument();
  });
});
