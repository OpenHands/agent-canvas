import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { InstallServerModal } from "#/components/features/mcp-page/install-server-modal";
import { MCP_MARKETPLACE, MarketplaceEntry } from "#/constants/mcp-marketplace";

function renderWith(ui: React.ReactNode) {
  return render(ui, {
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

describe("InstallServerModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      MOCK_DEFAULT_USER_SETTINGS,
    );
  });

  it("requires Slack token + team id and posts a stdio mcp_config diff", async () => {
    const slack = MCP_MARKETPLACE.find((e) => e.id === "slack")!;
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    const onClose = vi.fn();
    renderWith(<InstallServerModal entry={slack} onClose={onClose} />);

    await screen.findByTestId("mcp-install-modal");

    // Fail fast when required fields are empty.
    fireEvent.click(screen.getByTestId("mcp-install-submit"));
    await waitFor(() => {
      expect(saveSpy).not.toHaveBeenCalled();
    });

    fireEvent.change(screen.getByTestId("mcp-install-field-SLACK_BOT_TOKEN"), {
      target: { value: "xoxb-abc" },
    });
    fireEvent.change(screen.getByTestId("mcp-install-field-SLACK_TEAM_ID"), {
      target: { value: "T01" },
    });
    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const [payload] = saveSpy.mock.calls[0];
    const sentMcpConfig = (payload as Record<string, unknown>)
      .agent_settings_diff as {
      mcp_config: { mcpServers: Record<string, unknown> };
    };
    expect(sentMcpConfig.mcp_config.mcpServers).toMatchObject({
      slack: {
        command: "npx",
        env: { SLACK_BOT_TOKEN: "xoxb-abc", SLACK_TEAM_ID: "T01" },
      },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("installs Tavily as a stdio MCP server with TAVILY_API_KEY env", async () => {
    // Tavily was previously a fake `kind: "tavily-builtin"` template
    // that called saveSettings({ search_api_key }) — but that field
    // was dropped on the floor in both local and cloud save paths, so
    // installing Tavily silently did nothing. It's now a regular
    // stdio MCP entry (`npx -y tavily-mcp` + TAVILY_API_KEY) that
    // goes through the same mcp_config write as every other entry.
    const tavily = MCP_MARKETPLACE.find((e) => e.id === "tavily")!;
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    const onClose = vi.fn();
    renderWith(<InstallServerModal entry={tavily} onClose={onClose} />);

    await screen.findByTestId("mcp-install-modal");

    // Submit with no key fails the required-field check.
    fireEvent.click(screen.getByTestId("mcp-install-submit"));
    await waitFor(() => expect(saveSpy).not.toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("mcp-install-field-TAVILY_API_KEY"), {
      target: { value: "tvly-secret" },
    });
    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const sent = (saveSpy.mock.calls[0][0] as Record<string, unknown>)
      .agent_settings_diff as {
      mcp_config: { mcpServers: Record<string, unknown> };
    };
    expect(sent.mcp_config.mcpServers).toMatchObject({
      tavily: {
        command: "npx",
        args: ["-y", "tavily-mcp"],
        env: { TAVILY_API_KEY: "tvly-secret" },
      },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("blocks submission of an shttp template when api_key is required and empty", async () => {
    // Build a synthetic catalog entry with apiKeyOptional: false so we
    // exercise the new required-key validation in handleHttpServerSubmit
    // without relying on the catalog choosing to mark one this way.
    const entry: MarketplaceEntry = {
      id: "synthetic-required",
      name: "Synthetic",
      description: "Synthetic catalog entry used in tests.",
      logo: null,
      iconBg: "#000000",
      template: {
        kind: "shttp",
        url: "https://example.com/mcp",
        apiKeyOptional: false,
      },
    };
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderWith(<InstallServerModal entry={entry} onClose={vi.fn()} />);

    await screen.findByTestId("mcp-install-modal");

    fireEvent.click(screen.getByTestId("mcp-install-submit"));
    // No save call until the user fills in the key.
    await waitFor(() => {
      expect(saveSpy).not.toHaveBeenCalled();
    });

    fireEvent.change(screen.getByTestId("mcp-install-field-api_key"), {
      target: { value: "secret-123" },
    });
    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
  });

  it("allows submitting an shttp template with no key when apiKeyOptional is true", async () => {
    const entry: MarketplaceEntry = {
      id: "synthetic-optional",
      name: "Synthetic Optional",
      description: "Synthetic entry that allows empty api_key.",
      logo: null,
      iconBg: "#000000",
      template: {
        kind: "shttp",
        url: "https://example.com/mcp",
        apiKeyOptional: true,
      },
    };
    const getSpy = vi
      .spyOn(SettingsService, "getSettings")
      .mockResolvedValue(MOCK_DEFAULT_USER_SETTINGS);
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderWith(<InstallServerModal entry={entry} onClose={vi.fn()} />);

    await screen.findByTestId("mcp-install-modal");
    // The add-mcp-server mutation bails when useSettings() hasn't
    // resolved yet, so wait for the initial settings fetch before
    // submitting — otherwise the test races React Query.
    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
  });
});
