import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import { SecretsService } from "#/api/secrets-service";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import GitSettingsScreen from "#/routes/git-settings";
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

  it("renders the GitHub token input", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());
    vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([]);

    renderGitSettingsScreen();

    const githubTokenInput = await screen.findByTestId("github-token-input");

    expect(githubTokenInput).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).toBeDisabled();
  });

  it("enables saving after a provider token changes", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());
    vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([]);

    renderGitSettingsScreen();

    const user = userEvent.setup();
    const githubTokenInput = await screen.findByTestId("github-token-input");
    const submitButton = screen.getByTestId("submit-button");

    expect(submitButton).toBeDisabled();

    await user.type(githubTokenInput, "ghp_test_token");

    expect(submitButton).toBeEnabled();
  });

  it("enables disconnecting when a provider is already configured", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        provider_tokens_set: {
          github: "github.com",
        },
      }),
    );
    vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([]);

    renderGitSettingsScreen();

    await waitFor(() => {
      expect(screen.getByTestId("disconnect-tokens-button")).toBeEnabled();
    });
  });
});
