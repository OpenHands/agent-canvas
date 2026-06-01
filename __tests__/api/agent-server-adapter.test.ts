import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACP_SERVER_TAG_KEY,
  buildRuntimeServicesSystemSuffix,
  buildStartConversationRequest,
  getDefaultConversationTitle,
  toAppConversation,
  type DirectConversationInfo,
} from "#/api/agent-server-adapter";
import {
  removeStoredConversationMetadata,
  setStoredConversationMetadata,
} from "#/api/conversation-metadata-store";
import { DEFAULT_SETTINGS } from "#/services/settings";

const {
  mockGetAgentServerWorkingDir,
  mockIsAgentServerToolAvailable,
  mockGetEffectiveLocalBackend,
} = vi.hoisted(() => ({
  mockGetAgentServerWorkingDir: vi.fn(() => "/workspace/project/agent-canvas"),
  mockIsAgentServerToolAvailable: vi.fn((_toolName: string) => true),
  mockGetEffectiveLocalBackend: vi.fn(() => ({
    id: "default-local",
    name: "Local backend",
    host: "http://127.0.0.1:8000",
    apiKey: "session-key",
    kind: "local" as const,
  })),
}));

vi.mock("#/api/agent-server-config", () => ({
  getAgentServerBaseUrl: vi.fn(() => "http://127.0.0.1:8000"),
  getAgentServerSessionApiKey: vi.fn(() => null),
  getAgentServerWorkingDir: mockGetAgentServerWorkingDir,
  getConfiguredWorkerUrls: vi.fn(() => []),
  shouldLoadPublicSkills: vi.fn(() => true),
  syncBakedSessionApiKey: vi.fn(),
}));

vi.mock("#/api/agent-server-compatibility", () => ({
  isAgentServerToolAvailable: mockIsAgentServerToolAvailable,
}));

vi.mock("#/api/backend-registry/active-store", () => ({
  getEffectiveLocalBackend: mockGetEffectiveLocalBackend,
}));

beforeEach(() => {
  mockIsAgentServerToolAvailable.mockReturnValue(true);
  mockGetEffectiveLocalBackend.mockReturnValue({
    id: "default-local",
    name: "Local backend",
    host: "http://127.0.0.1:8000",
    apiKey: "session-key",
    kind: "local",
  });
});

describe("buildStartConversationRequest", () => {
  it("uses nested settings as the source of truth and lets the SDK create the agent", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        llm_model: "stale-top-level-model",
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          agent: "CodeActAgent",
          enable_sub_agents: true,
          llm: {
            model: "nested-model",
            api_key: "  nested-key  ",
            base_url: " https://nested.example.com ",
          },
          condenser: {
            enabled: true,
            max_size: 120,
          },
          enable_switch_llm_tool: true,
        },
        conversation_settings: {
          ...DEFAULT_SETTINGS.conversation_settings,
          max_iterations: 123,
        },
      },
      query: "hello",
    }) as {
      agent?: unknown;
      agent_settings: Record<string, unknown> & {
        llm: Record<string, unknown>;
        tools: Array<{ name: string; params: Record<string, unknown> }>;
        agent_context: Record<string, unknown>;
      };
      workspace: { working_dir: string };
      initial_message: { content: Array<{ text: string }> };
      max_iterations: number;
    };

    expect(payload.agent).toBeUndefined();
    expect(payload.agent_settings.llm).toMatchObject({
      model: "nested-model",
      api_key: "nested-key",
      base_url: "https://nested.example.com",
    });
    expect(payload.agent_settings.condenser).toEqual({
      enabled: true,
      max_size: 120,
    });
    expect(payload.agent_settings.tools).toEqual([
      { name: "terminal", params: {} },
      { name: "file_editor", params: {} },
      { name: "task_tracker", params: {} },
      { name: "canvas_ui", params: {} },
      { name: "browser_tool_set", params: {} },
      { name: "task_tool_set", params: {} },
    ]);
    expect(payload.agent_settings.agent_context).toEqual({
      load_public_skills: true,
      load_user_skills: true,
      load_project_skills: true,
    });
    expect(payload.agent_settings.agent).toBe("CodeActAgent");
    expect(payload.agent_settings.enable_switch_llm_tool).toBe(true);
    expect(payload.workspace.working_dir).toBe(
      "/workspace/project/agent-canvas",
    );
    expect(payload.max_iterations).toBe(123);
    expect(payload.initial_message.content[0]?.text).toBe("hello");
  });

  it("forwards the switch-LLM setting to SDK agent settings", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          enable_switch_llm_tool: true,
          llm: { model: "nested-model" },
        },
      },
    }) as {
      agent?: unknown;
      agent_settings: {
        enable_switch_llm_tool?: boolean;
        include_default_tools?: unknown;
      };
    };

    expect(payload.agent).toBeUndefined();
    expect(payload.agent_settings.enable_switch_llm_tool).toBe(true);
    expect(payload.agent_settings.include_default_tools).toBeUndefined();
  });

  it("omits browser_tool_set and task_tool_set when the server does not advertise them", () => {
    mockIsAgentServerToolAvailable.mockReturnValue(false);

    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          llm: { model: "nested-model" },
        },
      },
    }) as {
      agent_settings: {
        tools: Array<{ name: string; params: Record<string, unknown> }>;
      };
    };

    expect(payload.agent_settings.tools).toEqual([
      { name: "terminal", params: {} },
      { name: "file_editor", params: {} },
      { name: "task_tracker", params: {} },
      { name: "canvas_ui", params: {} },
    ]);
  });

  it("includes task_tool_set when sub-agents are enabled and the server advertises it but not browser tools", () => {
    mockIsAgentServerToolAvailable.mockImplementation(
      (toolName: string) => toolName === "task_tool_set",
    );

    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          enable_sub_agents: true,
          llm: { model: "nested-model" },
        },
      },
    }) as {
      agent_settings: {
        tools: Array<{ name: string; params: Record<string, unknown> }>;
      };
    };

    expect(payload.agent_settings.tools).toEqual([
      { name: "terminal", params: {} },
      { name: "file_editor", params: {} },
      { name: "task_tracker", params: {} },
      { name: "canvas_ui", params: {} },
      { name: "task_tool_set", params: {} },
    ]);
  });

  it("omits task_tool_set when sub-agents are disabled even if the server advertises it", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          enable_sub_agents: false,
          llm: { model: "nested-model" },
        },
      },
    }) as {
      agent_settings: {
        tools: Array<{ name: string; params: Record<string, unknown> }>;
      };
    };

    const toolNames = payload.agent_settings.tools.map((t) => t.name);
    expect(toolNames).not.toContain("task_tool_set");
  });

  it("derives confirmation and security settings the same way as OpenHands", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          llm: { model: "nested-model" },
        },
        conversation_settings: {
          ...DEFAULT_SETTINGS.conversation_settings,
          confirmation_mode: true,
          security_analyzer: "llm",
        },
      },
    }) as {
      confirmation_policy: Record<string, unknown>;
      security_analyzer: Record<string, unknown>;
    };

    expect(payload.confirmation_policy).toEqual({
      kind: "ConfirmRisky",
      threshold: "HIGH",
      confirm_unknown: true,
    });
    expect(payload.security_analyzer).toEqual({
      kind: "LLMSecurityAnalyzer",
    });
  });

  it("uses the supplied conversationId and workingDir overrides", () => {
    const conversationId = "11111111-1111-4111-8111-111111111111";
    const workingDir = `/base/${conversationId}`;
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          llm: { model: "nested-model" },
        },
      },
      conversationId,
      workingDir,
    }) as {
      conversation_id?: string;
      workspace: { working_dir: string };
    };

    expect(payload.conversation_id).toBe(conversationId);
    expect(payload.workspace.working_dir).toBe(workingDir);
  });

  it("always requests a git worktree for new conversations", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          llm: { model: "nested-model" },
        },
      },
    }) as { worktree: boolean };

    expect(payload.worktree).toBe(true);
  });

  it("forwards supported conversation runtime fields from nested settings", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          llm: { model: "nested-model" },
        },
        conversation_settings: {
          ...DEFAULT_SETTINGS.conversation_settings,
          hook_config: { on_start: [] },
          tool_module_qualnames: { demo_tool: "pkg.tools.demo" },
          agent_definitions: [
            { name: "reviewer", system_prompt: "be helpful" },
          ],
        },
      },
      conversationInstructions: "Follow the repo conventions.",
      plugins: [
        { source: "github.com/org/plugin", ref: "main", repo_path: "/" },
      ],
    }) as Record<string, unknown>;

    expect(payload.hook_config).toEqual({ on_start: [] });
    // Canvas-UI tool is auto-injected; user-supplied entries are merged in
    // alongside it. The dedicated canvas_ui describe block below pins the
    // exact merge semantics.
    expect(payload.tool_module_qualnames).toEqual({
      canvas_ui: "canvas_ui_tool",
      demo_tool: "pkg.tools.demo",
    });
    expect(payload.agent_definitions).toEqual([
      { name: "reviewer", system_prompt: "be helpful" },
    ]);
    expect(payload.plugins).toEqual([
      { source: "github.com/org/plugin", ref: "main", repo_path: "/" },
    ]);
    expect(payload.initial_message).toEqual({
      role: "user",
      content: [{ type: "text", text: "Follow the repo conventions." }],
      run: true,
    });
  });

  it("serializes custom secrets as host-relative LookupSecret entries", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          llm: { model: "nested-model" },
        },
      },
      customSecrets: [
        { name: "API_KEY", description: "Primary API key" },
        { name: "folder/name", description: "Nested secret" },
      ],
    }) as {
      secrets: Record<
        string,
        {
          kind: string;
          url: string;
          description?: string;
          headers?: Record<string, string>;
        }
      >;
    };

    expect(payload.secrets).toEqual({
      API_KEY: {
        kind: "LookupSecret",
        url: "/api/settings/secrets/API_KEY",
        description: "Primary API key",
        headers: { "X-Session-API-Key": "session-key" },
      },
      "folder/name": {
        kind: "LookupSecret",
        url: "/api/settings/secrets/folder%2Fname",
        description: "Nested secret",
        headers: { "X-Session-API-Key": "session-key" },
      },
    });
  });

  it("mirrors conversation secrets onto agent_settings.agent_context.secrets for ACP", () => {
    // Until canvas pins to an agent-server build that includes
    // software-agent-sdk PR #3299, the bare ``payload.secrets`` channel
    // only reaches ``secret_registry`` server-side — ``ACPAgent``'s
    // spawn-time env loop reads from ``agent_context.secrets``, not
    // from the registry, so a Settings → Secrets entry like
    // ``ANTHROPIC_API_KEY`` would silently fail to land in the ACP
    // CLI's environment. Mirror the same LookupSecret map onto
    // ``agent_settings.agent_context.secrets`` so the existing SDK loop picks
    // it up. Mirrors OpenHands' app-server bridging.
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
        },
      },
      customSecrets: [{ name: "ANTHROPIC_API_KEY" }],
    }) as {
      agent_settings: { agent_context?: { secrets?: Record<string, unknown> } };
      secrets: Record<string, unknown>;
    };

    // Same LookupSecret object lands in both places — the bare-secrets
    // channel (for any non-ACP consumer / for SDK #3299 once it lands)
    // and the agent_context bridge (for current ACPAgent spawns).
    expect(payload.secrets.ANTHROPIC_API_KEY).toBeDefined();
    expect(
      payload.agent_settings.agent_context?.secrets?.ANTHROPIC_API_KEY,
    ).toEqual(payload.secrets.ANTHROPIC_API_KEY);
  });

  it("does not synthesize agent_context.secrets for ACP when no custom secrets are set", () => {
    // Empty/absent customSecrets must not introduce an empty
    // ``agent_context.secrets`` map on the ACPAgent payload — the
    // bridge only fires when there's something to bridge.
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
        },
      },
    }) as {
      agent_settings: { agent_context?: { secrets?: Record<string, unknown> } };
    };

    expect(payload.agent_settings.agent_context?.secrets).toBeUndefined();
  });

  it("does not mirror conversation secrets onto agent_context for non-ACP conversations", () => {
    // The OpenHands ``Agent`` reads secrets from ``secret_registry``
    // directly (no spawn-env bridging needed), so the LLM-driven path
    // must not get an extra ``agent_context.secrets`` map — that would
    // be both redundant and a surprise for any code that inspects
    // ``agent_context`` for non-secret payload (skills, suffixes, etc.).
    const payload = buildStartConversationRequest({
      settings: DEFAULT_SETTINGS,
      customSecrets: [{ name: "ANTHROPIC_API_KEY" }],
    }) as {
      agent_settings: { agent_context?: { secrets?: Record<string, unknown> } };
    };

    expect(payload.agent_settings.agent_context?.secrets).toBeUndefined();
  });

  describe("canvas_ui tool injection", () => {
    it("always registers canvas_ui_tool in tool_module_qualnames, even when no user settings supply qualnames", () => {
      const payload = buildStartConversationRequest({
        settings: DEFAULT_SETTINGS,
      }) as { tool_module_qualnames: Record<string, string> };

      expect(payload.tool_module_qualnames).toMatchObject({
        canvas_ui: "canvas_ui_tool",
      });
    });

    it("merges user-supplied tool_module_qualnames alongside canvas_ui_tool without dropping either side", () => {
      const payload = buildStartConversationRequest({
        settings: {
          ...DEFAULT_SETTINGS,
          conversation_settings: {
            ...DEFAULT_SETTINGS.conversation_settings,
            tool_module_qualnames: { my_tool: "my_package.my_tool" },
          },
        },
      }) as { tool_module_qualnames: Record<string, string> };

      expect(payload.tool_module_qualnames).toEqual({
        canvas_ui: "canvas_ui_tool",
        my_tool: "my_package.my_tool",
      });
    });
  });

  // @spec LLD-001 — Frontend always sends its chosen default model
  describe("llm.model fallback — frontend always sends its chosen default", () => {
    type ModelPayload = {
      agent_settings: Record<string, unknown> & { llm: Record<string, unknown> };
    };

    function getModelFrom(
      options: Parameters<typeof buildStartConversationRequest>[0],
    ): unknown {
      return (buildStartConversationRequest(options) as unknown as ModelPayload)
        .agent_settings.llm.model;
    }

    it("uses the configured model when one is set", () => {
      expect(
        getModelFrom({
          settings: {
            ...DEFAULT_SETTINGS,
            agent_settings: {
              ...DEFAULT_SETTINGS.agent_settings,
              llm: { model: "anthropic/claude-opus-4-5" },
            },
          },
        }),
      ).toBe("anthropic/claude-opus-4-5");
    });

    // The agent-server returns '' when no model has been saved yet.
    // Without this guard the empty string passes the old typeof check and
    // the agent-server falls back to its own SDK default (gpt-5.5).
    // SettingsValue includes scalars so inline literals are type-safe here.
    it.each([
      ["undefined", { ...DEFAULT_SETTINGS.agent_settings, llm: {} }],
      ["an empty string", { ...DEFAULT_SETTINGS.agent_settings, llm: { model: "" } }],
      ["whitespace only", { ...DEFAULT_SETTINGS.agent_settings, llm: { model: "   " } }],
      // No llm key at all — SettingsValue accepts plain scalars.
      ["absent (no llm block)", { schema_version: 1, agent_kind: "openhands", agent: "CodeActAgent" }],
      // Mirrors a fresh user who skipped onboarding: server returns {}.
      ["entirely empty", {}],
    ])(
      "falls back to DEFAULT_SETTINGS.llm_model when agent_settings.llm.model is %s",
      (_, agentSettings) => {
        expect(
          getModelFrom({
            settings: {
              ...DEFAULT_SETTINGS,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              agent_settings: agentSettings as any,
            },
          }),
        ).toBe(DEFAULT_SETTINGS.llm_model);
      },
    );

    // encryptedAgentSettings overrides settings.agent_settings at conversation
    // start; if the encrypted payload has no model set the frontend default
    // must still be sent explicitly.
    it.each([
      ["carries an empty model", { llm: { model: "" } }],
      ["is empty", {}],
    ])(
      "falls back to DEFAULT_SETTINGS.llm_model when encryptedAgentSettings %s",
      (_, encryptedAgentSettings) => {
        expect(
          getModelFrom({
            settings: DEFAULT_SETTINGS,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            encryptedAgentSettings: encryptedAgentSettings as any,
          }),
        ).toBe(DEFAULT_SETTINGS.llm_model);
      },
    );
  });
});

describe("getDefaultConversationTitle", () => {
  it("formats the title using the first 5 characters of the conversation id", () => {
    expect(getDefaultConversationTitle("372eb-1234-5678-9abc")).toBe(
      "Conversation 372eb",
    );
  });
});

describe("toAppConversation", () => {
  const baseInfo: DirectConversationInfo = {
    id: "372eb-1234-5678-9abc",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("falls back to the default title when the backend returns null", () => {
    const result = toAppConversation({ ...baseInfo, title: null });
    expect(result.title).toBe("Conversation 372eb");
  });

  it("falls back to the default title when the backend returns undefined", () => {
    const result = toAppConversation({ ...baseInfo });
    expect(result.title).toBe("Conversation 372eb");
  });

  it("falls back to the default title when the backend returns an empty string", () => {
    const result = toAppConversation({ ...baseInfo, title: "" });
    expect(result.title).toBe("Conversation 372eb");
  });

  it("falls back to the default title when the backend returns whitespace only", () => {
    const result = toAppConversation({ ...baseInfo, title: "   " });
    expect(result.title).toBe("Conversation 372eb");
  });

  it("preserves a backend-provided title when one is set", () => {
    const result = toAppConversation({
      ...baseInfo,
      title: "My real title",
    });
    expect(result.title).toBe("My real title");
  });

  it("hydrates selected_workspace from stored metadata so the sidebar can group by it", () => {
    setStoredConversationMetadata(baseInfo.id, {
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      selected_workspace: "/workspace/agent-server-gui",
    });
    try {
      const result = toAppConversation({
        ...baseInfo,
        workspace: { working_dir: "/workspace/agent-server-gui/wt-abc" },
      });
      expect(result.selected_workspace).toBe("/workspace/agent-server-gui");
    } finally {
      removeStoredConversationMetadata(baseInfo.id);
    }
  });

  it("marks openhands conversations and surfaces the agent.llm.model", () => {
    const result = toAppConversation({
      ...baseInfo,
      agent: { kind: "Agent", llm: { model: "claude-sonnet-4-6" } },
    });
    expect(result.agent_kind).toBe("openhands");
    expect(result.llm_model).toBe("claude-sonnet-4-6");
  });

  it("marks ACP conversations and surfaces the configured acp_model", () => {
    // The SDK's ACPAgent may still carry a sentinel ``llm`` (``acp-managed``)
    // for cost-attribution. Consumers should see the concrete ACP model Canvas
    // configured, while SwitchProfileButton remains gated by agent_kind.
    const result = toAppConversation({
      ...baseInfo,
      agent: {
        kind: "ACPAgent",
        acp_model: "claude-sonnet-4-6",
        llm: { model: "acp-managed" },
      },
    });
    expect(result.agent_kind).toBe("acp");
    expect(result.llm_model).toBe("claude-sonnet-4-6");
  });

  it("prefers ACP runtime model fields over configured acp_model", () => {
    const result = toAppConversation({
      ...baseInfo,
      current_model_id: "claude-sonnet-4-6",
      current_model_name: "Claude Sonnet 4.6",
      agent: {
        kind: "ACPAgent",
        acp_model: "claude-opus-4-7",
        llm: { model: "acp-managed" },
      },
    });
    expect(result.agent_kind).toBe("acp");
    expect(result.llm_model).toBe("Claude Sonnet 4.6");
  });

  it("does not surface ACP default placeholders when a configured model exists", () => {
    const result = toAppConversation({
      ...baseInfo,
      current_model_id: "default",
      current_model_name: "Default (recommended)",
      agent: {
        kind: "ACPAgent",
        acp_model: "claude-sonnet-4-6",
        llm: { model: "acp-managed" },
      },
    });
    expect(result.agent_kind).toBe("acp");
    expect(result.llm_model).toBe("claude-sonnet-4-6");
  });

  it("falls back to a non-sentinel ACP llm.model for SDKs that mirror acp_model there", () => {
    const result = toAppConversation({
      ...baseInfo,
      agent: { kind: "ACPAgent", llm: { model: "claude-sonnet-4-6" } },
    });
    expect(result.agent_kind).toBe("acp");
    expect(result.llm_model).toBe("claude-sonnet-4-6");
  });

  it("filters ACP default placeholders surfaced via the configured acp_model", () => {
    // Older settings may have persisted the SDK's literal "default" string
    // into ``acp_model``. Surfacing it on the chip would lie about what's
    // running — the placeholder filter is applied to every candidate, not
    // just the runtime fields.
    const result = toAppConversation({
      ...baseInfo,
      agent: {
        kind: "ACPAgent",
        acp_model: "Default (recommended)",
        llm: { model: "acp-managed" },
      },
    });
    expect(result.agent_kind).toBe("acp");
    expect(result.llm_model).toBeNull();
  });

  it("filters ACP default placeholders surfaced via agent.llm.model", () => {
    // Same defense, one rung lower in the precedence chain.
    const result = toAppConversation({
      ...baseInfo,
      agent: { kind: "ACPAgent", llm: { model: "default" } },
    });
    expect(result.agent_kind).toBe("acp");
    expect(result.llm_model).toBeNull();
  });

  it("surfaces acp_server from tags.acpserver for ACP conversations", () => {
    // The ``acpserver`` conversation tag is stamped at create time
    // (``buildStartConversationRequest``) but never previously plumbed
    // through on read — the sidebar chip in agent-canvas#405 needs this
    // value to resolve the human display name ("Claude Code" / "Codex" /
    // "Gemini CLI").
    const result = toAppConversation({
      ...baseInfo,
      agent: { kind: "ACPAgent", llm: { model: "acp-managed" } },
      tags: { [ACP_SERVER_TAG_KEY]: "claude-code" },
    });
    expect(result.acp_server).toBe("claude-code");
  });

  it("leaves acp_server null when an ACP conversation has no tag stamped", () => {
    // Older conversations created before the tag was added, or ACP
    // conversations created via the raw API, won't have the tag. The
    // sidebar should still render a chip ("ACP") — but the resolver gets
    // null here and the UI fallback handles the generic label.
    const result = toAppConversation({
      ...baseInfo,
      agent: { kind: "ACPAgent", llm: { model: "acp-managed" } },
    });
    expect(result.agent_kind).toBe("acp");
    expect(result.acp_server).toBeNull();
  });

  it("ignores tags.acpserver on OpenHands conversations to prevent stray-tag bleed", () => {
    // The agent-server's pydantic model doesn't enforce that ``acpserver``
    // is only stamped on ACP conversations. Defensively gating on
    // ``agent.kind === "ACPAgent"`` keeps a misconfigured tag from
    // turning the sidebar of an OpenHands conversation into "Claude
    // Code". Pairs with the ``llm_model`` null-out for ACP.
    const result = toAppConversation({
      ...baseInfo,
      agent: { kind: "Agent", llm: { model: "claude-sonnet-4-6" } },
      tags: { [ACP_SERVER_TAG_KEY]: "claude-code" },
    });
    expect(result.agent_kind).toBe("openhands");
    expect(result.acp_server).toBeNull();
  });
});

describe("buildRuntimeServicesSystemSuffix", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined when VITE_RUNTIME_SERVICES_INFO is unset", () => {
    expect(buildRuntimeServicesSystemSuffix()).toBeUndefined();
  });

  it("returns undefined when the env var is malformed JSON", () => {
    vi.stubEnv("VITE_RUNTIME_SERVICES_INFO", "{not valid json");
    expect(buildRuntimeServicesSystemSuffix()).toBeUndefined();
  });

  it("returns undefined when the JSON has no services", () => {
    vi.stubEnv("VITE_RUNTIME_SERVICES_INFO", JSON.stringify({ mode: "x" }));
    expect(buildRuntimeServicesSystemSuffix()).toBeUndefined();
  });

  it("renders a <RUNTIME_SERVICES> block when an automation entry is present", () => {
    vi.stubEnv(
      "VITE_RUNTIME_SERVICES_INFO",
      JSON.stringify({
        mode: "dev:automation",
        agent_host_alias: "localhost",
        services: {
          agent_server: {
            description: "self",
            url_from_agent: "http://localhost:18000",
          },
          automation: {
            description: "automations",
            url_from_agent: "http://localhost:18001",
            api_prefix: "/api/automation",
            docs_url: "http://localhost:18001/api/automation/docs",
            openapi_url: "http://localhost:18001/api/automation/openapi.json",
            auth_env_var: "OPENHANDS_AUTOMATION_API_KEY",
          },
        },
      }),
    );
    const suffix = buildRuntimeServicesSystemSuffix();
    expect(suffix).toBeDefined();
    expect(suffix).toContain("<RUNTIME_SERVICES>");
    expect(suffix).toContain("dev:automation");
    expect(suffix).toContain("http://localhost:18000");
    expect(suffix).toContain("http://localhost:18001");
    expect(suffix).toContain("http://localhost:18001/api/automation/docs");
    expect(suffix).toContain("X-API-Key: $OPENHANDS_AUTOMATION_API_KEY");
    expect(suffix).toContain("</RUNTIME_SERVICES>");
    // The "don't guess" line should reference the actual agent-server URL
    // for this stack, not a hardcoded port. The assertion anchors on the URL
    // we supplied above.
    expect(suffix).toContain(
      "In particular, http://localhost:18000 inside your sandbox is the Agent Server",
    );
  });

  it("uses the configured agent-server URL in the don't-guess line (not a hardcoded :8000)", () => {
    // dev:safe runs the agent-server on :18000, not :8000. Make sure the
    // rendered block doesn't lie to the agent about its own URL.
    vi.stubEnv(
      "VITE_RUNTIME_SERVICES_INFO",
      JSON.stringify({
        mode: "dev:safe",
        services: {
          agent_server: { url_from_agent: "http://localhost:18000" },
        },
      }),
    );
    const suffix = buildRuntimeServicesSystemSuffix();
    expect(suffix).toBeDefined();
    expect(suffix).toContain(
      "In particular, http://localhost:18000 inside your sandbox is the Agent Server",
    );
    expect(suffix).not.toContain(
      "In particular, http://localhost:8000 inside your sandbox",
    );
  });

  it("renders the frontend entry with the new key", () => {
    vi.stubEnv(
      "VITE_RUNTIME_SERVICES_INFO",
      JSON.stringify({
        mode: "dev:static",
        services: {
          agent_server: { url_from_agent: "http://localhost:18000" },
          frontend: {
            kind: "static",
            description: "Static-file server hosting the agent-canvas build.",
            url_from_agent: "http://localhost:3001",
          },
        },
      }),
    );
    const suffix = buildRuntimeServicesSystemSuffix();
    expect(suffix).toContain("* Frontend: http://localhost:3001");
    expect(suffix).toContain("Static-file server");
    // Should NOT mislabel a static-build frontend as "Vite frontend".
    expect(suffix).not.toContain("Vite frontend");
  });

  it("accepts the legacy `vite` service key", () => {
    // Older launchers may still emit `services.vite`. Render it under the
    // new "Frontend" label rather than dropping the entry.
    vi.stubEnv(
      "VITE_RUNTIME_SERVICES_INFO",
      JSON.stringify({
        mode: "dev:safe",
        services: {
          agent_server: { url_from_agent: "http://localhost:18000" },
          vite: {
            description: "Vite dev server",
            url_from_agent: "http://localhost:3001",
          },
        },
      }),
    );
    const suffix = buildRuntimeServicesSystemSuffix();
    expect(suffix).toContain("* Frontend: http://localhost:3001");
  });

  it("explicitly mentions when automation is absent", () => {
    vi.stubEnv(
      "VITE_RUNTIME_SERVICES_INFO",
      JSON.stringify({
        mode: "dev:safe",
        services: {
          agent_server: { url_from_agent: "http://localhost:18000" },
        },
      }),
    );
    const suffix = buildRuntimeServicesSystemSuffix();
    expect(suffix).toBeDefined();
    expect(suffix).toContain("Automation backend: not running");
  });
});

describe("agent_settings runtime services suffix", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not set system_message_suffix when no runtime info is provided", () => {
    const payload = buildStartConversationRequest({
      settings: DEFAULT_SETTINGS,
      query: "hello",
    }) as {
      agent_settings: { agent_context: Record<string, unknown> };
    };
    expect(payload.agent_settings.agent_context).toEqual({
      load_public_skills: true,
      load_user_skills: true,
      load_project_skills: true,
    });
  });

  it("sets system_message_suffix when runtime info is provided", () => {
    vi.stubEnv(
      "VITE_RUNTIME_SERVICES_INFO",
      JSON.stringify({
        mode: "dev:automation",
        services: {
          agent_server: { url_from_agent: "http://localhost:18000" },
          automation: {
            url_from_agent: "http://localhost:18001",
          },
        },
      }),
    );
    const payload = buildStartConversationRequest({
      settings: DEFAULT_SETTINGS,
      query: "hello",
    }) as {
      agent_settings: { agent_context: Record<string, unknown> };
    };
    expect(payload.agent_settings.agent_context).toMatchObject({
      load_public_skills: true,
      load_user_skills: true,
    });
    expect(
      payload.agent_settings.agent_context.system_message_suffix as string,
    ).toContain("<RUNTIME_SERVICES>");
  });
});

describe("buildStartConversationRequest — ACP discriminator", () => {
  it("builds ACP agent settings when agent_kind is 'acp'", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
          acp_model: "claude-opus-4-5",
          // These fields are LLM-only and must NOT leak into ACP settings.
          agent: "CodeActAgent",
          llm: { model: "gpt-4", api_key: "should-not-appear" },
          condenser: { enabled: true, max_size: 240 },
          mcp_config: {
            mcpServers: { fake: { command: "x", args: [] } },
          },
        },
      },
    }) as {
      agent?: unknown;
      agent_settings: Record<string, unknown> & {
        acp_command?: string[];
        acp_model?: string | null;
        agent_context?: unknown;
      };
      tags?: Record<string, string>;
    };

    expect(payload.agent).toBeUndefined();
    expect(payload.agent_settings.agent_kind).toBe("acp");
    expect(payload.agent_settings.acp_command).toEqual([
      "npx",
      "-y",
      "@agentclientprotocol/claude-agent-acp",
    ]);
    expect(payload.agent_settings.acp_model).toBe("claude-opus-4-5");
    // LLM-only fields must not leak into the ACP settings payload.
    expect(payload.agent_settings.llm).toBeUndefined();
    expect(payload.agent_settings.condenser).toBeUndefined();
    expect(payload.agent_settings.tools).toBeUndefined();
    expect(payload.agent_settings.agent_context).toEqual({
      load_public_skills: true,
      load_user_skills: true,
      load_project_skills: true,
    });
    expect(payload.tags).toEqual({ [ACP_SERVER_TAG_KEY]: "claude-code" });
  });

  it("does not include ACP-only fields in OpenHands agent settings", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          ...DEFAULT_SETTINGS.agent_settings,
          agent_kind: "openhands",
          llm: { model: "gpt-4" },
          acp_command: ["npx", "leftover"],
          acp_server: "claude-code",
        },
      },
    }) as {
      agent?: unknown;
      agent_settings: Record<string, unknown> & {
        llm: Record<string, unknown>;
      };
      tags?: Record<string, string>;
    };

    expect(payload.agent).toBeUndefined();
    expect(payload.agent_settings.agent_kind).toBe("openhands");
    expect(payload.agent_settings.acp_command).toBeUndefined();
    expect(payload.agent_settings.acp_server).toBeUndefined();
    expect(payload.agent_settings.llm.model).toBe("gpt-4");
    expect(payload.tags).toBeUndefined();
  });

  it("omits acp_model when the user clears it (null)", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "custom",
          acp_command: ["./bin/my-agent"],
          acp_model: null,
        },
      },
    }) as { agent_settings: Record<string, unknown> };

    expect(payload.agent_settings.agent_kind).toBe("acp");
    expect(payload.agent_settings.acp_model).toBeUndefined();
  });

  it("resolves an empty acp_command from the registry by acp_server", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: [],
          acp_model: null,
        },
      },
    }) as {
      agent_settings: Record<string, unknown> & { acp_command?: unknown[] };
    };

    expect(payload.agent_settings.acp_command).toEqual([
      "npx",
      "-y",
      "@agentclientprotocol/claude-agent-acp",
    ]);
  });

  it("resolves an absent acp_command for built-in providers too", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "codex",
          acp_model: null,
        },
      },
    }) as {
      agent_settings: Record<string, unknown> & { acp_command?: unknown[] };
    };

    expect(payload.agent_settings.acp_command).toEqual([
      "npx",
      "-y",
      "@zed-industries/codex-acp",
    ]);
  });

  it("leaves acp_command alone when acp_server is 'custom'", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "custom",
          acp_command: [],
          acp_model: null,
        },
      },
    }) as {
      agent_settings: Record<string, unknown> & { acp_command?: unknown[] };
    };

    expect(payload.agent_settings.acp_command).toEqual([]);
  });

  it("leaves acp_command alone for an unknown acp_server key", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "future-provider-not-yet-mirrored",
          acp_command: [],
          acp_model: null,
        },
      },
    }) as {
      agent_settings: Record<string, unknown> & { acp_command?: unknown[] };
    };

    expect(payload.agent_settings.acp_command).toEqual([]);
  });

  it("seeds the provider default when settings contains an empty acp_model", () => {
    // The form may carry an empty string after a user clears the model
    // input. Older behavior left ``acp_model`` absent and relied on the
    // agent-server's own default; the registry-default path
    // (resolveEffectiveAcpModel) is now authoritative on Canvas's side,
    // so an empty string resolves to the provider's ``default_model``
    // before the request leaves the client. Keeps the displayed Settings
    // → Agent default in sync with what the runtime actually starts.
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: [],
          acp_model: "",
        },
      },
    }) as {
      agent_settings: Record<string, unknown> & { acp_model?: unknown };
    };

    expect(payload.agent_settings.acp_model).toBe("claude-opus-4-7");
  });

  it("omits acp_model for the custom preset when none is configured", () => {
    // The Custom preset has no registered ``default_model``, so an empty
    // ``acp_model`` falls through to ``undefined`` — the agent-server then
    // applies its own default. Distinct from the built-in providers
    // which substitute their registry default.
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "custom",
          acp_command: ["my-custom-acp"],
          acp_model: "",
        },
      },
    }) as {
      agent_settings: Record<string, unknown> & { acp_model?: unknown };
    };

    expect(payload.agent_settings.acp_model).toBeUndefined();
  });

  it("ACP → OpenHands → ACP round trip leaves no field leakage", () => {
    const baseAcpSettings = {
      ...DEFAULT_SETTINGS,
      agent_settings: {
        schema_version: 1,
        agent_kind: "acp",
        acp_server: "claude-code",
        acp_command: [],
        acp_env: { ANTHROPIC_API_KEY: "user-set-via-api" },
        acp_model: "claude-opus-4-5",
        agent: "CodeActAgent",
        llm: { model: "gpt-4o", api_key: "stale-from-prior-oh-run" },
        condenser: { enabled: true, max_size: 200 },
      },
    };

    const ohPayload = buildStartConversationRequest({
      settings: {
        ...baseAcpSettings,
        agent_settings: {
          ...baseAcpSettings.agent_settings,
          agent_kind: "openhands",
        },
      },
    }) as {
      agent_settings: Record<string, unknown> & {
        llm: Record<string, unknown>;
      };
    };

    expect(ohPayload.agent_settings.agent_kind).toBe("openhands");
    expect(ohPayload.agent_settings.acp_command).toBeUndefined();
    expect(ohPayload.agent_settings.acp_env).toBeUndefined();
    expect(ohPayload.agent_settings.acp_model).toBeUndefined();
    expect(ohPayload.agent_settings.acp_server).toBeUndefined();
    expect(ohPayload.agent_settings.llm.model).toBe("gpt-4o");

    const acpPayload = buildStartConversationRequest({
      settings: baseAcpSettings,
    }) as {
      agent_settings: Record<string, unknown> & {
        acp_command?: unknown;
        acp_env?: unknown;
        acp_model?: unknown;
        llm?: unknown;
        condenser?: unknown;
      };
    };

    expect(acpPayload.agent_settings.agent_kind).toBe("acp");
    expect(acpPayload.agent_settings.acp_command).toEqual([
      "npx",
      "-y",
      "@agentclientprotocol/claude-agent-acp",
    ]);
    expect(acpPayload.agent_settings.acp_model).toBe("claude-opus-4-5");
    expect(acpPayload.agent_settings.acp_env).toEqual({
      ANTHROPIC_API_KEY: "user-set-via-api",
    });
    expect(acpPayload.agent_settings.llm).toBeUndefined();
    expect(acpPayload.agent_settings.condenser).toBeUndefined();
  });
});
