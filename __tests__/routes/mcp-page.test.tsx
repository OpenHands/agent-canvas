import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MCPPage from "#/routes/mcp";
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

function renderPage() {
  return render(<MCPPage />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    ),
  });
}

describe("MCPPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the empty installed state and the marketplace", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderPage();

    await screen.findByTestId("mcp-marketplace-section");
    expect(screen.getByTestId("mcp-installed-empty")).toBeInTheDocument();
    expect(screen.getByTestId("mcp-marketplace-grid")).toBeInTheDocument();
  });

  it("lists GitHub, Slack, and Tavily as the first three marketplace tiles", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderPage();

    await screen.findByTestId("mcp-marketplace-grid");

    const cards = screen.getAllByTestId(/^mcp-marketplace-card-/);
    expect(cards.length).toBeGreaterThan(3);
    expect(cards[0]).toHaveAttribute(
      "data-testid",
      "mcp-marketplace-card-github",
    );
    expect(cards[1]).toHaveAttribute(
      "data-testid",
      "mcp-marketplace-card-slack",
    );
    expect(cards[2]).toHaveAttribute(
      "data-testid",
      "mcp-marketplace-card-tavily",
    );
  });

  it("opens the install modal when clicking a marketplace tile", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderPage();

    await screen.findByTestId("mcp-marketplace-card-slack");
    fireEvent.click(screen.getByTestId("mcp-marketplace-card-slack"));

    await waitFor(() => {
      expect(screen.getByTestId("mcp-install-modal")).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("mcp-install-field-SLACK_BOT_TOKEN"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("mcp-install-field-SLACK_TEAM_ID"),
    ).toBeInTheDocument();
  });

  it("filters marketplace tiles by the search input", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderPage();

    const search = await screen.findByTestId("mcp-search-input");
    fireEvent.change(search, { target: { value: "Slack" } });

    await waitFor(() => {
      expect(
        screen.getByTestId("mcp-marketplace-card-slack"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("mcp-marketplace-card-github"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mcp-marketplace-card-postgres"),
    ).not.toBeInTheDocument();
  });

  it("shows a search-empty state when the query matches nothing", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderPage();

    const search = await screen.findByTestId("mcp-search-input");
    fireEvent.change(search, {
      target: { value: "totally-not-a-real-server" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("mcp-marketplace-empty")).toBeInTheDocument();
    });
  });

  it("badges Tavily as installed when search_api_key_set is true", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ search_api_key_set: true }),
    );

    renderPage();

    await screen.findByTestId("mcp-marketplace-card-tavily");
    expect(
      screen.getByTestId("mcp-marketplace-installed-tavily"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mcp-installed-list")).toBeInTheDocument();
  });
});
