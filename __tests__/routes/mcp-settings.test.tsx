import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MCPSettingsScreen from "#/routes/mcp-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings } from "#/types/settings";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
      ...overrides.agent_settings,
    },
    mcp_config: overrides.mcp_config ?? MOCK_DEFAULT_USER_SETTINGS.mcp_config,
  };
}

function renderMcpSettingsScreen() {
  return render(<MCPSettingsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })}
      >
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    ),
  });
}

describe("MCPSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the OSS MCP settings list and search API key section", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderMcpSettingsScreen();

    await screen.findByTestId("mcp-search-settings-section");

    expect(screen.getByTestId("search-api-key-input")).toBeInTheDocument();
    expect(screen.getByTestId("save-search-api-key-button")).toBeDisabled();
  });
});