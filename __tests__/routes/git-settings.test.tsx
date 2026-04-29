import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import { GIT_PROVIDER_TOKENS_UNSUPPORTED_MESSAGE } from "#/api/secrets-service";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import GitSettingsScreen, { clientLoader } from "#/routes/git-settings";
import { Settings } from "#/types/settings";

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    provider_tokens_set: {
      ...MOCK_DEFAULT_USER_SETTINGS.provider_tokens_set,
      ...overrides.provider_tokens_set,
    },
    agent_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
      ...overrides.agent_settings,
    },
  };
}

function renderGitSettingsScreen() {
  return render(<GitSettingsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })}
      >
        {children}
      </QueryClientProvider>
    ),
  });
}

describe("GitSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an unsupported notice instead of Git provider token controls", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderGitSettingsScreen();

    expect(
      await screen.findByTestId("git-provider-settings-unavailable"),
    ).toHaveTextContent(GIT_PROVIDER_TOKENS_UNSUPPORTED_MESSAGE);
    expect(screen.queryByTestId("github-token-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("submit-button")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("disconnect-tokens-button"),
    ).not.toBeInTheDocument();
  });
});

describe("clientLoader permission checks", () => {
  it("exports a clientLoader", () => {
    expect(clientLoader).toBeDefined();
    expect(typeof clientLoader).toBe("function");
  });
});
