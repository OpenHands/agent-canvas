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

  it("renders the agent type selector defaulting to OpenHands with sub-agents toggle", async () => {
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
    // Sub-agents toggle visible on the OpenHands branch.
    expect(
      screen.getByTestId("agent-settings-enable-sub-agents"),
    ).toBeInTheDocument();
    // ACP-only fields stay hidden on the OpenHands branch.
    expect(screen.queryByTestId("agent-command-input")).not.toBeInTheDocument();
  });

  it("labels the save button 'Save Changes' for consistency with other settings pages", async () => {
    // Arrange — render with any valid settings; the label is independent
    // of the form's state.
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          agent_kind: "openhands",
        },
      }),
    );

    // Act
    renderAgentSettingsScreen();
    await screen.findByTestId("agent-settings-screen");

    // Assert — t() is stubbed to return the key, so the rendered text is
    // the translation key. SETTINGS$SAVE_CHANGES = "Save Changes" in
    // public/locales/en/openhands.json; BUTTON$SAVE = "Save" (the bug).
    expect(screen.getByTestId("agent-save-button")).toHaveTextContent(
      "SETTINGS$SAVE_CHANGES",
    );
  });

  it("saves enable_sub_agents when toggling on the OpenHands path", async () => {
    const user = userEvent.setup();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
          agent_kind: "openhands",
          enable_sub_agents: false,
        },
      }),
    );
    const save = vi.spyOn(SettingsService, "saveSettings");

    renderAgentSettingsScreen();
    await screen.findByTestId("agent-settings-screen");

    // Toggle sub-agents on via the enclosing label
    const toggle = screen.getByTestId("agent-settings-enable-sub-agents");
    const label = toggle.closest("label")!;
    await user.click(label);

    await user.click(screen.getByTestId("agent-save-button"));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(call.agent_settings_diff).toEqual({
      agent_kind: "openhands",
      enable_sub_agents: true,
    });
  });

  it("hides sub-agents toggle when ACP is selected", async () => {
    const user = userEvent.setup();
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

    // Sub-agents toggle should be visible initially
    expect(
      screen.getByTestId("agent-settings-enable-sub-agents"),
    ).toBeInTheDocument();

    // Switch to ACP
    await user.click(screen.getByTestId("agent-type-selector"));
    await user.click(
      await screen.findByRole("option", { name: "SETTINGS$AGENT_TYPE_ACP" }),
    );

    // Sub-agents toggle should be hidden, ACP fields should appear
    expect(
      screen.queryByTestId("agent-settings-enable-sub-agents"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-command-input")).toBeInTheDocument();
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
    expect(commandInput.value).toBe(
      "npx -y @agentclientprotocol/claude-agent-acp",
    );
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
    expect(call.agent_settings_diff).toEqual({
      agent_kind: "openhands",
      enable_sub_agents: false,
    });
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

  it("preserves an unknown loaded acp_server when the user saves without editing", async () => {
    // Data-corruption regression: a user with an ``acp_server`` value
    // canvas's registry doesn't know about (e.g. set via the API for a
    // future provider that hasn't been mirrored into ``ACP_PROVIDERS``
    // yet) opens Settings → Agent and clicks Save. Without preservation
    // the save flow demotes ``acp_server: "amp"`` → ``acp_server:
    // "custom"`` because ``detectPreset`` returns ``custom`` for any
    // unknown server. The original key name is silently lost.
    //
    // The fix is narrow: when the user hasn't touched the command since
    // load AND the loaded server is non-empty, non-``"custom"``, and
    // absent from ``ACP_PROVIDERS``, write the loaded key back verbatim
    // via the ``allowUnknownServer`` pass-through.
    const user = userEvent.setup();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "amp",
          acp_command: ["npx", "-y", "@some-future/amp-acp"],
          acp_args: [],
        },
      }),
    );
    const save = vi.spyOn(SettingsService, "saveSettings");

    renderAgentSettingsScreen();
    const cmd = (await screen.findByTestId(
      "agent-command-input",
    )) as HTMLTextAreaElement;
    expect(cmd.value).toBe("npx -y @some-future/amp-acp");

    // Touch + revert the textarea to flip isDirty without changing
    // the persisted command text — matches "user opens settings and
    // hits Save without intending to change anything."
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
    expect(call.agent_settings_diff?.acp_server).toBe("amp");
    expect(call.agent_settings_diff?.acp_command).toEqual([
      "npx",
      "-y",
      "@some-future/amp-acp",
    ]);
  });

  it("demotes an unknown loaded acp_server to 'custom' when the user edits the command", async () => {
    // Counterpart to the preserve test: editing the command is a
    // material change of configuration, so it's correct to drop the
    // unknown ``amp`` key and fall back to ``"custom"``. The user is
    // configuring a new command, not preserving the prior one — so
    // the preset name follows the command.
    const user = userEvent.setup();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "amp",
          acp_command: ["npx", "-y", "@some-future/amp-acp"],
          acp_args: [],
        },
      }),
    );
    const save = vi.spyOn(SettingsService, "saveSettings");

    renderAgentSettingsScreen();
    const cmd = (await screen.findByTestId(
      "agent-command-input",
    )) as HTMLTextAreaElement;

    // Actually change the command — append a flag so the textarea
    // differs from the loaded value.
    await user.click(cmd);
    await user.keyboard("{End} --new-flag");

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
      "@some-future/amp-acp",
      "--new-flag",
    ]);
  });
});
