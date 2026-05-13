import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentSettingsScreen from "#/routes/agent-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings } from "#/types/settings";

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings:
      overrides.agent_settings ?? MOCK_DEFAULT_USER_SETTINGS.agent_settings,
  };
}

function renderAgentSettingsScreen() {
  return render(<AgentSettingsScreen />, {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    ),
  });
}

describe("AgentSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
  });

  it("renders the agent type selector defaulting to OpenHands", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          agent_kind: "openhands",
        },
      }),
    );

    renderAgentSettingsScreen();
    await screen.findByTestId("agent-settings-screen");
    expect(screen.getByTestId("agent-type-selector")).toBeInTheDocument();
    // ACP-only fields stay hidden on the OpenHands branch.
    expect(screen.queryByTestId("agent-command-input")).not.toBeInTheDocument();
  });

  it("shows the ACP form when the active agent_kind is acp", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: ["npx", "-y", "@zed-industries/claude-code-acp"],
          acp_model: "claude-opus-4-5",
        },
      }),
    );

    renderAgentSettingsScreen();
    const commandInput = (await screen.findByTestId(
      "agent-command-input",
    )) as HTMLTextAreaElement;
    expect(commandInput.value).toBe("npx -y @zed-industries/claude-code-acp");
    const modelInput = screen.getByTestId(
      "agent-model-input",
    ) as HTMLInputElement;
    expect(modelInput.value).toBe("claude-opus-4-5");
  });

  it("saves an ACP diff when switching to ACP + Claude Code", async () => {
    const user = userEvent.setup();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          agent_kind: "openhands",
        },
      }),
    );
    const save = vi.spyOn(SettingsService, "saveSettings");

    renderAgentSettingsScreen();
    await screen.findByTestId("agent-settings-screen");

    // Switching to ACP prefills the command from the first registered provider
    // (Claude Code).
    await user.click(screen.getByTestId("agent-type-selector"));
    await user.click(
      await screen.findByRole("option", { name: "SETTINGS$AGENT_TYPE_ACP" }),
    );

    const commandInput = (await screen.findByTestId(
      "agent-command-input",
    )) as HTMLTextAreaElement;
    expect(commandInput.value).toBe(
      "npx -y @zed-industries/claude-code-acp",
    );

    await user.click(screen.getByTestId("agent-save-button"));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(call.agent_settings_diff).toEqual({
      agent_kind: "acp",
      acp_server: "claude-code",
      // The default-command path stores acp_command: [] and lets the registry
      // resolve it on the agent-server side. Round-tripping verbatim would
      // pin a stale command if the registry default changes upstream.
      acp_command: [],
      acp_model: null,
    });
  });

  it("clears ACP fields when switching back to OpenHands", async () => {
    const user = userEvent.setup();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: ["npx", "-y", "@zed-industries/claude-code-acp"],
        },
      }),
    );
    const save = vi.spyOn(SettingsService, "saveSettings");

    renderAgentSettingsScreen();
    await screen.findByTestId("agent-settings-screen");

    await user.click(screen.getByTestId("agent-type-selector"));
    await user.click(
      await screen.findByRole("option", {
        name: "SETTINGS$AGENT_TYPE_OPENHANDS",
      }),
    );
    await user.click(screen.getByTestId("agent-save-button"));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(call.agent_settings_diff).toEqual({ agent_kind: "openhands" });
  });
});
