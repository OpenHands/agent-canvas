import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import McpService from "#/api/mcp-service/mcp-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { InstallServerModal } from "#/components/features/mcp-page/install-server-modal";
import {
  INTEGRATION_CATALOG as INTEGRATION_MARKETPLACE,
  type IntegrationCatalogEntry as MarketplaceEntry,
} from "@openhands/extensions/integrations";

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
    // Default: pre-flight test passes so existing save tests remain unaffected.
    vi.spyOn(McpService, "testServer").mockResolvedValue({
      ok: true,
      tools: [],
    });
  });

  it("requires Tavily API key and posts a stdio mcp_config diff", async () => {
    // Tavily is a stdio-only integration with a single envField.
    // Slack now defaults to OAuth/shttp, so we test stdio installs with Tavily.
    const tavily = INTEGRATION_MARKETPLACE.find(
      (e: MarketplaceEntry) => e.id === "tavily",
    )!;
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    const onClose = vi.fn();
    renderWith(<InstallServerModal entry={tavily} onClose={onClose} />);

    await screen.findByTestId("mcp-install-modal");

    // Fail fast when required fields are empty.
    fireEvent.click(screen.getByTestId("mcp-install-submit"));
    await waitFor(() => {
      expect(saveSpy).not.toHaveBeenCalled();
    });

    fireEvent.change(screen.getByTestId("mcp-install-field-TAVILY_API_KEY"), {
      target: { value: "tvly-test-key" },
    });
    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const [payload] = saveSpy.mock.calls[0];
    const sentMcpConfig = (payload as Record<string, unknown>)
      .agent_settings_diff as {
      mcp_config: { mcpServers: Record<string, unknown> };
    };
    expect(sentMcpConfig.mcp_config.mcpServers).toMatchObject({
      tavily: {
        command: "npx",
        args: ["-y", "tavily-mcp"],
        env: { TAVILY_API_KEY: "tvly-test-key" },
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
      kind: "mcp",
      name: "Synthetic",
      description: "Synthetic catalog entry used in tests.",
      iconBg: "#000000",
      connectionOptions: [
        {
          id: "api",
          provider: "mcp",
          transport: {
            kind: "shttp",
            url: "https://example.com/mcp",
            apiKeyOptional: false,
          },
          auth: { strategy: "api_key" },
        },
      ],
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
      kind: "mcp",
      name: "Synthetic Optional",
      description: "Synthetic entry that allows empty api_key.",
      iconBg: "#000000",
      connectionOptions: [
        {
          id: "api",
          provider: "mcp",
          transport: {
            kind: "shttp",
            url: "https://example.com/mcp",
            apiKeyOptional: true,
          },
          auth: { strategy: "api_key" },
        },
      ],
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

  it("closes from the top-right close button", async () => {
    const onClose = vi.fn();
    const tavily = INTEGRATION_MARKETPLACE.find(
      (e: MarketplaceEntry) => e.id === "tavily",
    )!;
    renderWith(<InstallServerModal entry={tavily} onClose={onClose} />);
    await screen.findByTestId("mcp-install-modal");

    fireEvent.click(screen.getByTestId("mcp-install-modal-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("places Cancel before Install in the footer so the dominant action is the last focusable button", async () => {
    // Arrange: render with any marketplace entry so the footer is mounted.
    const tavily = INTEGRATION_MARKETPLACE.find(
      (e: MarketplaceEntry) => e.id === "tavily",
    )!;
    renderWith(<InstallServerModal entry={tavily} onClose={vi.fn()} />);
    await screen.findByTestId("mcp-install-modal");

    // Act: locate both footer buttons.
    const cancel = screen.getByTestId("mcp-install-cancel");
    const submit = screen.getByTestId("mcp-install-submit");

    // Assert: Cancel precedes the dominant Install action in DOM order.
    // eslint-disable-next-line no-bitwise
    expect(
      cancel.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows an inline error, does not save, and keeps the modal open when the pre-flight test fails", async () => {
    vi.spyOn(McpService, "testServer").mockResolvedValue({
      ok: false,
      error: "ECONNREFUSED",
      error_kind: "connection",
    });
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);
    const onClose = vi.fn();

    const entry: MarketplaceEntry = {
      id: "synthetic-test-fail",
      kind: "mcp",
      name: "Failing Server",
      description: "Always fails the connection test.",
      iconBg: "#000000",
      connectionOptions: [
        {
          id: "api",
          provider: "mcp",
          transport: {
            kind: "shttp",
            url: "https://example.com/mcp",
            apiKeyOptional: true,
          },
          auth: { strategy: "api_key" },
        },
      ],
    };

    renderWith(<InstallServerModal entry={entry} onClose={onClose} />);
    await screen.findByTestId("mcp-install-modal");

    // Wait for settings to load so the mutation isn't a no-op.
    await waitFor(() =>
      expect(SettingsService.getSettings).toHaveBeenCalled(),
    );

    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    // Error message must appear.
    await waitFor(() =>
      expect(screen.getByTestId("mcp-install-modal-error")).toBeInTheDocument(),
    );

    // Save must never have been called.
    expect(saveSpy).not.toHaveBeenCalled();

    // Modal must stay open.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("mcp-install-modal")).toBeInTheDocument();
  });

  it("calls save and closes the modal when the pre-flight test succeeds", async () => {
    vi.spyOn(McpService, "testServer").mockResolvedValue({
      ok: true,
      tools: ["tool_a"],
    });
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);
    const onClose = vi.fn();

    const entry: MarketplaceEntry = {
      id: "synthetic-test-pass",
      kind: "mcp",
      name: "Passing Server",
      description: "Always passes the connection test.",
      iconBg: "#000000",
      connectionOptions: [
        {
          id: "api",
          provider: "mcp",
          transport: {
            kind: "shttp",
            url: "https://example.com/mcp",
            apiKeyOptional: true,
          },
          auth: { strategy: "api_key" },
        },
      ],
    };

    renderWith(<InstallServerModal entry={entry} onClose={onClose} />);
    await screen.findByTestId("mcp-install-modal");

    await waitFor(() =>
      expect(SettingsService.getSettings).toHaveBeenCalled(),
    );

    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId("mcp-install-modal-error"),
    ).not.toBeInTheDocument();
  });

  it("shows Verifying… on the install button while the pre-flight test is in flight", async () => {
    // Never resolve so the test stays pending long enough to observe the label.
    vi.spyOn(McpService, "testServer").mockImplementation(
      () => new Promise(() => {}),
    );

    const entry: MarketplaceEntry = {
      id: "synthetic-pending",
      kind: "mcp",
      name: "Pending Server",
      description: "Connection test never resolves.",
      iconBg: "#000000",
      connectionOptions: [
        {
          id: "api",
          provider: "mcp",
          transport: {
            kind: "shttp",
            url: "https://example.com/mcp",
            apiKeyOptional: true,
          },
          auth: { strategy: "api_key" },
        },
      ],
    };

    renderWith(<InstallServerModal entry={entry} onClose={vi.fn()} />);
    await screen.findByTestId("mcp-install-modal");

    await waitFor(() =>
      expect(SettingsService.getSettings).toHaveBeenCalled(),
    );

    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    // In tests i18n keys are returned as-is, so the button shows the key name.
    await waitFor(() =>
      expect(screen.getByTestId("mcp-install-submit")).toHaveTextContent(
        "MCP$VERIFYING",
      ),
    );
  });
});
