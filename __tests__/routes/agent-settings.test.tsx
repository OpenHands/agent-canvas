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
          acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
          acp_model: "claude-opus-4-5",
        },
      }),
    );

    renderAgentSettingsScreen();
    const commandInput = (await screen.findByTestId(
      "agent-command-input",
    )) as HTMLTextAreaElement;
    expect(commandInput.value).toBe("npx -y @agentclientprotocol/claude-agent-acp");
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
      "npx -y @agentclientprotocol/claude-agent-acp",
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
      // ``acp_args: []`` is reset on every save so an API-set
      // ``acp_args`` can't survive and concatenate onto the spawn
      // command at conversation-create time.
      acp_args: [],
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
          acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
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

  it("disables Save when the user has cleared the command on the ACP path", async () => {
    const user = userEvent.setup();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
        },
      }),
    );

    renderAgentSettingsScreen();
    const cmd = (await screen.findByTestId(
      "agent-command-input",
    )) as HTMLTextAreaElement;
    const save = screen.getByTestId("agent-save-button") as HTMLButtonElement;

    // Clear the field. Save should be disabled (the agent-server would
    // crash on an empty acp_command and the adapter has no way to
    // recover — better to block the save than silently submit garbage).
    await user.clear(cmd);
    expect(save).toBeDisabled();
  });

  it("treats whitespace-only as empty and keeps Save disabled", async () => {
    const user = userEvent.setup();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
        },
      }),
    );

    renderAgentSettingsScreen();
    const cmd = (await screen.findByTestId(
      "agent-command-input",
    )) as HTMLTextAreaElement;
    const save = screen.getByTestId("agent-save-button") as HTMLButtonElement;
    await user.clear(cmd);
    await user.type(cmd, "   \t   ");
    expect(save).toBeDisabled();
  });

  it("preserves a Custom command with quoted args end-to-end", async () => {
    // Regression guard for the .split-vs-shell-quote bug: a Custom
    // command like ``bash -c "echo hi"`` used to get tokenised as
    // ``["bash","-c","\"echo","hi\""]`` and silently fail at spawn.
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

    await user.click(screen.getByTestId("agent-type-selector"));
    await user.click(
      await screen.findByRole("option", { name: "SETTINGS$AGENT_TYPE_ACP" }),
    );
    const cmd = (await screen.findByTestId(
      "agent-command-input",
    )) as HTMLTextAreaElement;
    await user.clear(cmd);
    await user.type(cmd, 'bash -c "echo hi"');
    await user.click(screen.getByTestId("agent-save-button"));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(call.agent_settings_diff?.acp_command).toEqual([
      "bash",
      "-c",
      "echo hi",
    ]);
    // Anything that diverges from a built-in default-command snaps to
    // the Custom preset.
    expect(call.agent_settings_diff?.acp_server).toBe("custom");
  });

  it("preserves the registry default when acp_command:[] + non-empty acp_args is loaded", async () => {
    // Regression guard for the data-corruption bug:
    //
    //   stored: acp_server: 'claude-code', acp_command: [], acp_args:
    //           ['--extra-arg']
    //   actual spawn: ['npx', '-y', '@agentclientprotocol/claude-agent-acp',
    //                  '--extra-arg']
    //
    // The form used to merge acp_command + acp_args literally and would
    // show only ``--extra-arg`` in the textarea. Saving then sent
    // ``acp_command: ['--extra-arg']`` and flipped the preset to
    // ``custom``, silently dropping the registry-default prefix.
    // The load path must expand the default *before* merging with args.
    const user = userEvent.setup();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: [],
          acp_args: ["--extra-arg"],
        },
      }),
    );
    const save = vi.spyOn(SettingsService, "saveSettings");

    renderAgentSettingsScreen();
    const cmd = (await screen.findByTestId(
      "agent-command-input",
    )) as HTMLTextAreaElement;
    expect(cmd.value).toBe(
      "npx -y @agentclientprotocol/claude-agent-acp --extra-arg",
    );

    // Touch the form to mark it dirty (Save is disabled until isDirty),
    // then submit. The data the form sends has to carry the registry-
    // default prefix the user can now SEE in the textarea, not the bare
    // ``--extra-arg`` that was stored.
    await user.click(cmd);
    await user.keyboard("{End} ");
    await user.keyboard("{Backspace}");

    await user.click(screen.getByTestId("agent-save-button"));
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(call.agent_settings_diff?.acp_server).toBe("custom");
    expect(call.agent_settings_diff?.acp_command).toEqual([
      "npx",
      "-y",
      "@agentclientprotocol/claude-agent-acp",
      "--extra-arg",
    ]);
    // ``acp_args: []`` resets the API-set args so they don't double up
    // at spawn time.
    expect(call.agent_settings_diff?.acp_args).toEqual([]);
  });
});
