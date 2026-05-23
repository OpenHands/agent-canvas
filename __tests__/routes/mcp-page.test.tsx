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
      screen.queryByTestId("mcp-marketplace-card-gitlab"),
    ).not.toBeInTheDocument();
  });

  it("keeps installed custom servers visible and searchable even when they are not in the marketplace catalog", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          mcp_config: {
            mcpServers: {
              acme_internal: {
                command: "npx",
                args: ["-y", "@acme/internal-mcp-server"],
              },
            },
          },
        },
      }),
    );

    renderPage();

    await screen.findByTestId("mcp-installed-list");
    expect(screen.getByText("acme_internal")).toBeInTheDocument();
    expect(
      screen.queryByTestId("mcp-marketplace-card-acme_internal"),
    ).not.toBeInTheDocument();

    const search = screen.getByTestId("mcp-search-input");
    fireEvent.change(search, { target: { value: "internal-mcp-server" } });

    await waitFor(() => {
      expect(screen.getByText("acme_internal")).toBeInTheDocument();
    });
    expect(screen.getByTestId("mcp-marketplace-empty")).toBeInTheDocument();
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

  it("deletes an installed stdio server through the confirmation modal", async () => {
    // Pre-install a Slack stdio server via the SDK-shaped mcp_config
    // the route reads from agent_settings.mcp_config.
    const settingsWithSlack = buildSettings({
      agent_settings: {
        ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
        mcp_config: {
          mcpServers: {
            slack: {
              command: "npx",
              args: ["-y", "@zencoderai/slack-mcp-server"],
              env: { SLACK_BOT_TOKEN: "xoxb-abc", SLACK_TEAM_ID: "T01" },
            },
          },
        },
      },
    });
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      settingsWithSlack,
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderPage();

    const deleteBtn = await screen.findByTestId("delete-mcp-server-button");
    fireEvent.click(deleteBtn);

    const confirmBtn = await screen.findByTestId("confirm-button");
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const sent = (saveSpy.mock.calls[0][0] as Record<string, unknown>)
      .agent_settings_diff as { mcp_config: unknown };
    // Server gets pulled out of mcp_config entirely (parseMcpConfig
    // emits `null` once the last entry is removed).
    expect(sent.mcp_config).toBeNull();
  });

  it("badges Tavily as installed when the persisted mcp_config contains it", async () => {
    // Tavily is now a regular stdio MCP entry (it used to claim to be
    // a built-in driven by search_api_key, but that field was never
    // forwarded to either backend). Installation status comes from
    // the same mcp_config lookup as every other entry.
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          mcp_config: {
            mcpServers: {
              tavily: {
                command: "npx",
                args: ["-y", "tavily-mcp"],
                env: { TAVILY_API_KEY: "tvly-secret" },
              },
            },
          },
        },
      }),
    );

    renderPage();

    await screen.findByTestId("mcp-marketplace-card-tavily");
    expect(
      screen.getByTestId("mcp-marketplace-installed-tavily"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mcp-installed-list")).toBeInTheDocument();
  });

  it("opens the install modal in add-only mode for a marketplace tile that's already installed", async () => {
    // Regression test: clicking an installed marketplace tile must
    // open a fresh "Install" modal so the user can add a second
    // instance (e.g. a second Slack workspace). Previously this
    // coerced into edit mode and `Save changes` overwrote the
    // existing entry, so the second instance never landed and the
    // first one got clobbered.
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          mcp_config: {
            mcpServers: {
              slack: {
                command: "npx",
                args: ["-y", "@zencoderai/slack-mcp-server"],
                env: { SLACK_BOT_TOKEN: "xoxb-old", SLACK_TEAM_ID: "T01" },
              },
            },
          },
        },
      }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderPage();

    const tile = await screen.findByTestId("mcp-marketplace-card-slack");
    // The tile shows the Installed badge but the click should still
    // open an add-flow modal — not jump to an edit form.
    expect(
      screen.getByTestId("mcp-marketplace-installed-slack"),
    ).toBeInTheDocument();
    fireEvent.click(tile);

    await screen.findByTestId("mcp-install-modal");
    // Action label confirms add-only semantics (no `Save changes`).
    expect(screen.getByTestId("mcp-install-submit")).toHaveTextContent(
      "MCP$INSTALL_BUTTON",
    );

    fireEvent.change(screen.getByTestId("mcp-install-field-SLACK_BOT_TOKEN"), {
      target: { value: "xoxb-new" },
    });
    fireEvent.change(screen.getByTestId("mcp-install-field-SLACK_TEAM_ID"), {
      target: { value: "T02" },
    });
    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const sent = (saveSpy.mock.calls[0][0] as Record<string, unknown>)
      .agent_settings_diff as {
      mcp_config: { mcpServers: Record<string, unknown> };
    };
    // The original Slack entry is preserved AND a second one is added
    // alongside it (suffix-collided name comes from the per-base
    // uniqueness logic in toSdkMcpConfig).
    expect(Object.keys(sent.mcp_config.mcpServers).sort()).toEqual([
      "slack",
      "slack_1",
    ]);
    expect(sent.mcp_config.mcpServers).toMatchObject({
      slack: { env: { SLACK_BOT_TOKEN: "xoxb-old" } },
      slack_1: { env: { SLACK_BOT_TOKEN: "xoxb-new", SLACK_TEAM_ID: "T02" } },
    });
  });

  it("opens the custom server editor when the header 'Add custom server' button is clicked", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());

    renderPage();

    const addCustomBtn = await screen.findByTestId("mcp-add-custom-server");
    fireEvent.click(addCustomBtn);

    await waitFor(() => {
      expect(screen.getByTestId("mcp-custom-editor")).toBeInTheDocument();
    });
  });
});
