import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import McpService from "#/api/mcp-service/mcp-service.api";
import { SecretsService } from "#/api/secrets-service";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { InstallServerModal } from "#/components/features/mcp-page/install-server-modal";
import {
  INTEGRATION_CATALOG as MCP_MARKETPLACE,
  type IntegrationCatalogEntry as MarketplaceEntry,
} from "@openhands/extensions/integrations";
import { getMcpMarketplaceCatalog } from "#/utils/mcp-marketplace-utils";

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

  it("uses Slack's API fallback when the default option is OAuth", async () => {
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
        args: ["-y", "@zencoderai/slack-mcp-server"],
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
      kind: "mcp",
      name: "Synthetic",
      description: "Synthetic catalog entry used in tests.",
      iconBg: "#000000",
      defaultConnectionOptionId: "api",
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
      defaultConnectionOptionId: "api",
      connectionOptions: [
        {
          id: "api",
          provider: "mcp",
          transport: {
            kind: "shttp",
            url: "https://example.com/mcp",
            apiKeyOptional: true,
          },
          auth: { strategy: "api_key", apiKeyOptional: true },
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

  it("installs Linear over streamable HTTP with the api key as a bearer credential", async () => {
    // Arrange: the marketplace serves the patched Linear entry (shttp
    // /mcp endpoint, bearer auth) — the UI must never touch the removed
    // /sse transport.
    const linear = getMcpMarketplaceCatalog(MCP_MARKETPLACE).find(
      (e) => e.id === "linear",
    )!;
    const testSpy = vi
      .spyOn(McpService, "testServer")
      .mockResolvedValue({ ok: true, tools: [] });
    const getSpy = vi
      .spyOn(SettingsService, "getSettings")
      .mockResolvedValue(MOCK_DEFAULT_USER_SETTINGS);
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderWith(<InstallServerModal entry={linear} onClose={vi.fn()} />);
    await screen.findByTestId("mcp-install-modal");
    // Wait for useSettings() so the add-mcp-server mutation doesn't bail.
    await waitFor(() => expect(getSpy).toHaveBeenCalled());

    // Act: provide the optional Linear API key and install.
    fireEvent.change(screen.getByTestId("mcp-install-field-api_key"), {
      target: { value: "lin_api_secret" },
    });
    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    // Assert: both the pre-flight test and the persisted config target
    // the new endpoint over streamable HTTP with the bearer credential.
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    expect(testSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "shttp",
        url: "https://mcp.linear.app/mcp",
        api_key: "lin_api_secret",
      }),
    );
    const sent = (saveSpy.mock.calls[0][0] as Record<string, unknown>)
      .agent_settings_diff as {
      mcp_config: { mcpServers: Record<string, unknown> };
    };
    expect(sent.mcp_config.mcpServers).toMatchObject({
      shttp: {
        url: "https://mcp.linear.app/mcp",
        headers: { Authorization: "Bearer lin_api_secret" },
      },
    });
  });

  it("closes from the top-right close button", async () => {
    const onClose = vi.fn();
    const slack = MCP_MARKETPLACE.find((e) => e.id === "slack")!;
    renderWith(<InstallServerModal entry={slack} onClose={onClose} />);
    await screen.findByTestId("mcp-install-modal");

    fireEvent.click(screen.getByTestId("mcp-install-modal-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("places Cancel before Install in the footer so the dominant action is the last focusable button", async () => {
    // Arrange: render with any marketplace entry so the footer is mounted.
    const slack = MCP_MARKETPLACE.find((e) => e.id === "slack")!;
    renderWith(<InstallServerModal entry={slack} onClose={vi.fn()} />);
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
      defaultConnectionOptionId: "api",
      connectionOptions: [
        {
          id: "api",
          provider: "mcp",
          transport: {
            kind: "shttp",
            url: "https://example.com/mcp",
            apiKeyOptional: true,
          },
          auth: { strategy: "api_key", apiKeyOptional: true },
        },
      ],
    };

    renderWith(<InstallServerModal entry={entry} onClose={onClose} />);
    await screen.findByTestId("mcp-install-modal");

    // Wait for settings to load so the mutation isn't a no-op.
    await waitFor(() => expect(SettingsService.getSettings).toHaveBeenCalled());

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
      defaultConnectionOptionId: "api",
      connectionOptions: [
        {
          id: "api",
          provider: "mcp",
          transport: {
            kind: "shttp",
            url: "https://example.com/mcp",
            apiKeyOptional: true,
          },
          auth: { strategy: "api_key", apiKeyOptional: true },
        },
      ],
    };

    renderWith(<InstallServerModal entry={entry} onClose={onClose} />);
    await screen.findByTestId("mcp-install-modal");

    await waitFor(() => expect(SettingsService.getSettings).toHaveBeenCalled());

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
      defaultConnectionOptionId: "api",
      connectionOptions: [
        {
          id: "api",
          provider: "mcp",
          transport: {
            kind: "shttp",
            url: "https://example.com/mcp",
            apiKeyOptional: true,
          },
          auth: { strategy: "api_key", apiKeyOptional: true },
        },
      ],
    };

    renderWith(<InstallServerModal entry={entry} onClose={vi.fn()} />);
    await screen.findByTestId("mcp-install-modal");

    await waitFor(() => expect(SettingsService.getSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    // In tests i18n keys are returned as-is, so the button shows the key name.
    await waitFor(() =>
      expect(screen.getByTestId("mcp-install-submit")).toHaveTextContent(
        "MCP$VERIFYING",
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Save-as-secret toggle behaviour
  // ---------------------------------------------------------------------------

  // Synthetic stdio entry with one password-type envField, one text-type
  // envField, and one argField. This gives us complete control over field
  // types without depending on the live integration catalog.
  const STDIO_ENTRY = {
    id: "synthetic-stdio",
    kind: "mcp",
    name: "Synthetic Stdio Server",
    description: "Stdio server used to test the save-as-secret feature.",
    iconBg: "#000000",
    defaultConnectionOptionId: "stdio",
    connectionOptions: [
      {
        id: "stdio",
        provider: "mcp",
        transport: {
          kind: "stdio",
          serverName: "test-server",
          command: "npx",
          args: ["-y", "test-mcp"],
          envFields: [
            {
              key: "API_KEY",
              label: "API Key",
              type: "password",
              required: true,
              placeholder: "Enter API key",
            },
            {
              key: "USERNAME",
              label: "Username",
              type: "text",
              required: false,
              placeholder: "Enter username",
            },
          ],
          argFields: [
            {
              key: "EXTRA_ARG",
              label: "Extra Arg",
              type: "text",
              required: false,
              placeholder: "optional",
            },
          ],
        },
        auth: { strategy: "api_key", apiKeyOptional: true },
      },
    ],
  } as unknown as MarketplaceEntry;

  const SHTTP_ENTRY = {
    id: "synthetic-shttp-secret",
    kind: "mcp",
    name: "Synthetic Hosted Server",
    description: "Hosted server used to test credential secret saving.",
    iconBg: "#000000",
    defaultConnectionOptionId: "api",
    connectionOptions: [
      {
        id: "api",
        provider: "mcp",
        transport: {
          kind: "shttp",
          url: "https://example.com/mcp",
        },
        auth: {
          strategy: "api_key",
          credentialLabel: "Personal access token",
          credentialPlaceholder: "pat_...",
          credentialHelp: "Token from the provider settings.",
          credentialSecretName: "PROVIDER_PERSONAL_ACCESS_TOKEN",
          saveCredentialAsSecretByDefault: true,
        },
      },
    ],
  } as unknown as MarketplaceEntry;

  describe("InstallServerModal — save as secret", () => {
    beforeEach(() => {
      vi.spyOn(SecretsService, "createSecret").mockResolvedValue();
    });

    it("pre-checks the toggle for password-type envFields", async () => {
      renderWith(<InstallServerModal entry={STDIO_ENTRY} onClose={vi.fn()} />);
      await screen.findByTestId("mcp-install-modal");

      const toggle = screen.getByTestId("mcp-install-save-secret-API_KEY");
      expect(toggle.querySelector("input[type='checkbox']")).toBeChecked();
    });

    it("leaves non-password envFields unchecked by default", async () => {
      renderWith(<InstallServerModal entry={STDIO_ENTRY} onClose={vi.fn()} />);
      await screen.findByTestId("mcp-install-modal");

      const toggle = screen.getByTestId("mcp-install-save-secret-USERNAME");
      expect(toggle.querySelector("input[type='checkbox']")).not.toBeChecked();
    });

    it("does not render a toggle for argFields", async () => {
      renderWith(<InstallServerModal entry={STDIO_ENTRY} onClose={vi.fn()} />);
      await screen.findByTestId("mcp-install-modal");

      expect(
        screen.queryByTestId("mcp-install-save-secret-EXTRA_ARG"),
      ).not.toBeInTheDocument();
    });

    it("toggling the checkbox updates its checked state", async () => {
      renderWith(<InstallServerModal entry={STDIO_ENTRY} onClose={vi.fn()} />);
      await screen.findByTestId("mcp-install-modal");

      // USERNAME starts unchecked; clicking it should flip to checked.
      const toggle = screen.getByTestId("mcp-install-save-secret-USERNAME");
      const checkbox = toggle.querySelector(
        "input[type='checkbox']",
      ) as HTMLInputElement;
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);

      expect(checkbox).toBeChecked();
    });

    it("setValue preserves savedAsSecret state when a field value changes", async () => {
      // Before the ...prev bug-fix in setValue, calling onChange on any field
      // would reset savedAsSecret to {}, unchecking all toggles silently.
      renderWith(<InstallServerModal entry={STDIO_ENTRY} onClose={vi.fn()} />);
      await screen.findByTestId("mcp-install-modal");

      // API_KEY starts pre-checked. Typing a new value should leave it checked.
      fireEvent.change(screen.getByTestId("mcp-install-field-API_KEY"), {
        target: { value: "new-value" },
      });

      const toggle = screen.getByTestId("mcp-install-save-secret-API_KEY");
      expect(toggle.querySelector("input[type='checkbox']")).toBeChecked();
    });

    it("calls createSecret for checked envFields after a successful install", async () => {
      vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
      const onClose = vi.fn();
      renderWith(<InstallServerModal entry={STDIO_ENTRY} onClose={onClose} />);
      await screen.findByTestId("mcp-install-modal");
      await waitFor(() =>
        expect(SettingsService.getSettings).toHaveBeenCalled(),
      );

      // Fill in the required password field (API_KEY is pre-checked as secret).
      fireEvent.change(screen.getByTestId("mcp-install-field-API_KEY"), {
        target: { value: "my-api-key" },
      });
      fireEvent.click(screen.getByTestId("mcp-install-submit"));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(SecretsService.createSecret).toHaveBeenCalledWith(
          "API_KEY",
          "my-api-key",
          "API Key",
        ),
      );
      // USERNAME was unchecked, so no secret call for it.
      expect(SecretsService.createSecret).not.toHaveBeenCalledWith(
        "USERNAME",
        expect.anything(),
        expect.anything(),
      );
    });

    it("saves hosted MCP credentials as named secrets when configured", async () => {
      vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
      const onClose = vi.fn();
      renderWith(<InstallServerModal entry={SHTTP_ENTRY} onClose={onClose} />);
      await screen.findByTestId("mcp-install-modal");
      await waitFor(() =>
        expect(SettingsService.getSettings).toHaveBeenCalled(),
      );

      expect(screen.getByTestId("mcp-install-field-url")).toHaveValue(
        "https://example.com/mcp",
      );
      expect(screen.getByLabelText("Personal access token")).toHaveAttribute(
        "placeholder",
        "pat_...",
      );
      expect(
        screen.getByText("Token from the provider settings."),
      ).toBeInTheDocument();

      const toggle = screen.getByTestId(
        "mcp-install-save-secret-PROVIDER_PERSONAL_ACCESS_TOKEN",
      );
      expect(toggle.querySelector("input[type='checkbox']")).toBeChecked();

      fireEvent.change(screen.getByTestId("mcp-install-field-api_key"), {
        target: { value: "hosted-token" },
      });
      fireEvent.click(screen.getByTestId("mcp-install-submit"));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(SecretsService.createSecret).toHaveBeenCalledWith(
          "PROVIDER_PERSONAL_ACCESS_TOKEN",
          "hosted-token",
          "Personal access token",
        ),
      );
    });

    it("waits for hosted credential secrets before reporting install success", async () => {
      vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
      let resolveSecret!: () => void;
      const secretSaved = new Promise<void>((resolve) => {
        resolveSecret = resolve;
      });
      vi.spyOn(SecretsService, "createSecret").mockReturnValue(secretSaved);
      const onClose = vi.fn();
      const onSuccess = vi.fn();

      renderWith(
        <InstallServerModal
          entry={SHTTP_ENTRY}
          onClose={onClose}
          onSuccess={onSuccess}
        />,
      );
      await screen.findByTestId("mcp-install-modal");
      await waitFor(() =>
        expect(SettingsService.getSettings).toHaveBeenCalled(),
      );

      fireEvent.change(screen.getByTestId("mcp-install-field-api_key"), {
        target: { value: "hosted-token" },
      });
      fireEvent.click(screen.getByTestId("mcp-install-submit"));

      await waitFor(() =>
        expect(SecretsService.createSecret).toHaveBeenCalledWith(
          "PROVIDER_PERSONAL_ACCESS_TOKEN",
          "hosted-token",
          "Personal access token",
        ),
      );
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();

      resolveSecret();

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call createSecret when all toggles are unchecked before install", async () => {
      vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
      const onClose = vi.fn();
      renderWith(<InstallServerModal entry={STDIO_ENTRY} onClose={onClose} />);
      await screen.findByTestId("mcp-install-modal");
      await waitFor(() =>
        expect(SettingsService.getSettings).toHaveBeenCalled(),
      );

      fireEvent.change(screen.getByTestId("mcp-install-field-API_KEY"), {
        target: { value: "my-api-key" },
      });

      // Uncheck the pre-checked API_KEY toggle before submitting.
      const toggle = screen.getByTestId("mcp-install-save-secret-API_KEY");
      fireEvent.click(toggle.querySelector("input[type='checkbox']")!);

      fireEvent.click(screen.getByTestId("mcp-install-submit"));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

      // Flush the fire-and-forget microtask chain.
      await Promise.resolve();
      await Promise.resolve();
      expect(SecretsService.createSecret).not.toHaveBeenCalled();
    });

    it("closes the modal even when the secret save fails", async () => {
      vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
      vi.spyOn(SecretsService, "createSecret").mockRejectedValue(
        new Error("forbidden"),
      );
      const onClose = vi.fn();
      renderWith(<InstallServerModal entry={STDIO_ENTRY} onClose={onClose} />);
      await screen.findByTestId("mcp-install-modal");
      await waitFor(() =>
        expect(SettingsService.getSettings).toHaveBeenCalled(),
      );

      fireEvent.change(screen.getByTestId("mcp-install-field-API_KEY"), {
        target: { value: "my-api-key" },
      });
      fireEvent.click(screen.getByTestId("mcp-install-submit"));

      // The modal must close regardless of the secret-save outcome.
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      // Secret save errors use toasts, not the modal inline error element.
      expect(
        screen.queryByTestId("mcp-install-modal-error"),
      ).not.toBeInTheDocument();
    });
  });
});
