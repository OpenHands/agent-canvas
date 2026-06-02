import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LlmNotConfiguredBanner } from "#/components/features/home/llm-not-configured-banner";
import { NavigationProvider } from "#/context/navigation-context";
import { useSettings } from "#/hooks/query/use-settings";
import { useConfig } from "#/hooks/query/use-config";
import SettingsService from "#/api/settings-service/settings-service.api";
import OptionService from "#/api/option-service/option-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings } from "#/types/settings";
import { WebClientConfig } from "#/api/option-service/option.types";

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings:
      overrides.agent_settings ?? MOCK_DEFAULT_USER_SETTINGS.agent_settings,
  };
}

function buildConfig(hideLlmSettings = false): WebClientConfig {
  return {
    posthog_client_key: null,
    feature_flags: {
      hide_llm_settings: hideLlmSettings,
      hide_users_page: true,
    },
    providers_configured: [],
    maintenance_start_time: null,
    recaptcha_site_key: null,
    faulty_models: [],
    error_message: null,
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

// Renders the banner next to a probe that flips on once both underlying
// queries have resolved. The "hidden" assertions wait on this marker so they
// observe the settled state rather than the (always-empty) loading frame.
function ProbedBanner() {
  const settings = useSettings();
  const config = useConfig();
  return (
    <>
      <LlmNotConfiguredBanner />
      {settings.isFetched && config.isFetched ? (
        <div data-testid="queries-settled" />
      ) : null}
    </>
  );
}

function renderBanner() {
  const navigate = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NavigationProvider
        value={{
          currentPath: "/",
          conversationId: null,
          isNavigating: false,
          navigate,
        }}
      >
        <ProbedBanner />
      </NavigationProvider>
    </QueryClientProvider>,
  );
  return { navigate };
}

describe("LlmNotConfiguredBanner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(OptionService, "getConfig").mockResolvedValue(buildConfig());
  });

  it("warns the user when no LLM API key is set (the skip-onboarding case)", async () => {
    // Arrange: an OpenHands agent with no key — what "Skip for now" leaves.
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ llm_api_key_set: false }),
    );

    // Act
    renderBanner();

    // Assert
    expect(
      await screen.findByTestId("home-llm-not-configured-banner"),
    ).toBeInTheDocument();
  });

  it("stays hidden once an LLM API key is configured", async () => {
    // Arrange
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ llm_api_key_set: true }),
    );

    // Act
    renderBanner();
    await screen.findByTestId("queries-settled");

    // Assert
    expect(
      screen.queryByTestId("home-llm-not-configured-banner"),
    ).not.toBeInTheDocument();
  });

  it("stays hidden for ACP agents, which own their LLM and need no key", async () => {
    // Arrange: ACP agent, no key — must not be nagged.
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        llm_api_key_set: false,
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          agent_kind: "acp",
        },
      }),
    );

    // Act
    renderBanner();
    await screen.findByTestId("queries-settled");

    // Assert
    expect(
      screen.queryByTestId("home-llm-not-configured-banner"),
    ).not.toBeInTheDocument();
  });

  it("routes the user to LLM settings when the action is clicked", async () => {
    // Arrange
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ llm_api_key_set: false }),
    );
    const user = userEvent.setup();
    const { navigate } = renderBanner();

    // Act
    await user.click(
      await screen.findByTestId("home-llm-not-configured-action"),
    );

    // Assert
    expect(navigate).toHaveBeenCalledWith("/settings/llm");
  });
});
