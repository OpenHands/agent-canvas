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
  it("uses nested settings as the source of truth and keeps SDK tool names", () => {
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
        },
        conversation_settings: {
          ...DEFAULT_SETTINGS.conversation_settings,
          max_iterations: 123,
        },
      },
      query: "hello",
    }) as {
      agent: Record<string, unknown> & {
        llm: Record<string, unknown>;
        tools: Array<{ name: string; params: Record<string, unknown> }>;
        include_default_tools: string[];
      };
      workspace: { working_dir: string };
      initial_message: { content: Array<{ text: string }> };
      max_iterations: number;
    };

    expect(payload.agent.llm).toMatchObject({
      model: "nested-model",
      api_key: "nested-key",
      base_url: "https://nested.example.com",
    });
    expect(payload.agent.condenser).toEqual({
      kind: "LLMSummarizingCondenser",
      llm: {
        model: "nested-model",
        api_key: "nested-key",
        base_url: "https://nested.example.com",
        usage_id: "condenser",
      },
      max_size: 120,
    });
    expect(payload.agent.tools).toEqual([
      { name: "terminal", params: {} },
      { name: "file_editor", params: {} },
      { name: "task_tracker", params: {} },
      { name: "canvas_ui", params: {} },
      { name: "browser_tool_set", params: {} },
      { name: "task_tool_set", params: {} },
    ]);
    expect(payload.agent.include_default_tools).toEqual([
      "FinishTool",
      "ThinkTool",
    ]);
    expect(payload.agent.agent_context).toEqual({
      load_public_skills: true,
      load_user_skills: true,
    });
    expect(payload.agent.agent).toBeUndefined();
    expect(payload.workspace.working_dir).toBe(
      "/workspace/project/agent-canvas",
    );
    expect(payload.max_iterations).toBe(123);
    expect(payload.initial_message.content[0]?.text).toBe("hello");
  });

  it("adds the SDK switch-LLM built-in when the agent-server setting is enabled", () => {
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
      agent: {
        include_default_tools: string[];
        enable_switch_llm_tool?: boolean;
      };
    };

    expect(payload.agent.include_default_tools).toEqual([
      "FinishTool",
      "ThinkTool",
      "SwitchLLMTool",
    ]);
    expect(payload.agent.enable_switch_llm_tool).toBeUndefined();
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
      agent: {
        tools: Array<{ name: string; params: Record<string, unknown> }>;
      };
    };

    expect(payload.agent.tools).toEqual([
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
      agent: {
        tools: Array<{ name: string; params: Record<string, unknown> }>;
      };
    };

    expect(payload.agent.tools).toEqual([
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
      agent: {
        tools: Array<{ name: string; params: Record<string, unknown> }>;
      };
    };

    const toolNames = payload.agent.tools.map((t) => t.name);
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

  it("mirrors conversation secrets onto agent.agent_context.secrets for ACP", () => {
    // Until canvas pins to an agent-server build that includes
    // software-agent-sdk PR #3299, the bare ``payload.secrets`` channel
    // only reaches ``secret_registry`` server-side — ``ACPAgent``'s
    // spawn-time env loop reads from ``agent_context.secrets``, not
    // from the registry, so a Settings → Secrets entry like
    // ``ANTHROPIC_API_KEY`` would silently fail to land in the ACP
    // CLI's environment. Mirror the same LookupSecret map onto
    // ``agent.agent_context.secrets`` so the existing SDK loop picks
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
      agent: { agent_context?: { secrets?: Record<string, unknown> } };
      secrets: Record<string, unknown>;
    };

    // Same LookupSecret object lands in both places — the bare-secrets
    // channel (for any non-ACP consumer / for SDK #3299 once it lands)
    // and the agent_context bridge (for current ACPAgent spawns).
    expect(payload.secrets.ANTHROPIC_API_KEY).toBeDefined();
    expect(payload.agent.agent_context?.secrets?.ANTHROPIC_API_KEY).toEqual(
      payload.secrets.ANTHROPIC_API_KEY,
    );
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
      agent: { agent_context?: { secrets?: Record<string, unknown> } };
    };

    expect(payload.agent.agent_context?.secrets).toBeUndefined();
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
      agent: { agent_context?: { secrets?: Record<string, unknown> } };
    };

    expect(payload.agent.agent_context?.secrets).toBeUndefined();
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

  it("marks ACP conversations and nulls llm_model so the chat UI can't mislead", () => {
    // The SDK's ACPAgent carries a sentinel ``llm`` (``acp-managed``) for
    // cost-attribution only; the *real* model lives on the ACP subprocess via
    // ``acp_model`` and isn't surfaced on ``agent.llm.model``. Surfacing the
    // sentinel as ``llm_model`` would let SwitchProfileButton render an
    // affordance to "change the model" on a Claude-Code conversation while
    // the running subprocess kept its own — a confusing silent no-op.
    const result = toAppConversation({
      ...baseInfo,
      agent: { kind: "ACPAgent", llm: { model: "acp-managed" } },
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
            openapi_url:
              "http://localhost:18001/api/automation/openapi.json",
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
    expect(suffix).toContain(
      "http://localhost:18001/api/automation/docs",
    );
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

describe("createAgentFromSettings runtime services suffix", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not set system_message_suffix when no runtime info is provided", () => {
    const payload = buildStartConversationRequest({
      settings: DEFAULT_SETTINGS,
      query: "hello",
    }) as {
      agent: { agent_context: Record<string, unknown> };
    };
    expect(payload.agent.agent_context).toEqual({
      load_public_skills: true,
      load_user_skills: true,
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
      agent: { agent_context: Record<string, unknown> };
    };
    expect(payload.agent.agent_context).toMatchObject({
      load_public_skills: true,
      load_user_skills: true,
    });
    expect(
      payload.agent.agent_context.system_message_suffix as string,
    ).toContain("<RUNTIME_SERVICES>");
  });
});

describe("buildStartConversationRequest — ACP discriminator", () => {
  it("builds an ACPAgent payload when agent_kind is 'acp'", () => {
    const payload = buildStartConversationRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        agent_settings: {
          schema_version: 1,
          agent_kind: "acp",
          acp_server: "claude-code",
          acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
          acp_model: "claude-opus-4-5",
          // These fields are LLM-only and must NOT leak into the ACP payload.
          agent: "CodeActAgent",
          llm: { model: "gpt-4", api_key: "should-not-appear" },
          condenser: { enabled: true, max_size: 240 },
          mcp_config: {
            mcpServers: { fake: { command: "x", args: [] } },
          },
        },
      },
    }) as {
      agent: Record<string, unknown> & {
        kind: string;
        acp_command?: string[];
        acp_model?: string | null;
        llm?: unknown;
        condenser?: unknown;
        tools?: unknown;
        agent_context?: unknown;
      };
      tags?: Record<string, string>;
    };

    expect(payload.agent.kind).toBe("ACPAgent");
    expect(payload.agent.acp_command).toEqual([
      "npx",
      "-y",
      "@agentclientprotocol/claude-agent-acp",
    ]);
    expect(payload.agent.acp_model).toBe("claude-opus-4-5");
    // LLM-only fields must not leak into the ACPAgent payload.
    expect(payload.agent.llm).toBeUndefined();
    expect(payload.agent.condenser).toBeUndefined();
    expect(payload.agent.tools).toBeUndefined();
    // ``agent_context`` IS populated on the ACP payload — the SDK marks
    // ``skills`` / ``system_message_suffix`` / ``load_*_skills`` as
    // ``acp_compatible: true``, and the ACP CLI's system prompt renders
    // them via ``ACPAgent._render_suffix``. Without seeding these, an
    // ACP user would silently lose the skill catalog and the runtime-
    // services awareness an OpenHands-driven conversation gets.
    expect(payload.agent.agent_context).toEqual({
      load_public_skills: true,
      load_user_skills: true,
    });
    // Conversation tags carry the ACP provider key for chip rendering.
    // Agent-server validates tag keys against ``^[a-z0-9]+$``, so the
    // snake_case ``acp_server`` form would be rejected — we use the
    // flattened ``acpserver`` form instead. Asserted via the exported
    // constant so a rename surfaces here as a compile error rather
    // than a silent schema-mismatch at runtime.
    expect(payload.tags).toEqual({ [ACP_SERVER_TAG_KEY]: "claude-code" });
  });

  it("does not include ACP fields in the OpenHands Agent payload", () => {
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
      agent: Record<string, unknown> & { kind: string };
      tags?: Record<string, string>;
    };

    expect(payload.agent.kind).toBe("Agent");
    expect(payload.agent.acp_command).toBeUndefined();
    expect(payload.agent.acp_server).toBeUndefined();
    expect(payload.agent.agent_kind).toBeUndefined();
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
    }) as { agent: Record<string, unknown> };

    expect((payload.agent as { kind: string }).kind).toBe("ACPAgent");
    expect(payload.agent.acp_model).toBeUndefined();
  });

  it("resolves an empty acp_command from the registry by acp_server", () => {
    // The Settings → Agent page and onboarding both store ``acp_command:
    // []`` for the default-preset path on the assumption that the agent-
    // server resolves it from ``acp_server``. The agent-server's ACPAgent
    // model does no such resolution — empty list crashes the spawn with
    // ``IndexError: list index out of range`` (acp_agent.py:1013) and the
    // conversation hangs in ``idle`` forever. The adapter has to expand
    // the command before the payload leaves the client.
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
      agent: Record<string, unknown> & { acp_command?: unknown[] };
    };

    expect(payload.agent.acp_command).toEqual([
      "npx",
      "-y",
      "@agentclientprotocol/claude-agent-acp",
    ]);
  });

  it("resolves an absent acp_command for built-in providers too", () => {
    // The acp_command field may also be omitted entirely (e.g. on an older
    // settings shape that predates the field). Same fix applies.
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
      agent: Record<string, unknown> & { acp_command?: unknown[] };
    };

    expect(payload.agent.acp_command).toEqual([
      "npx",
      "-y",
      "@zed-industries/codex-acp",
    ]);
  });

  it("leaves acp_command alone when acp_server is 'custom'", () => {
    // Custom servers carry the user's explicit command. If they submitted
    // an empty one, that is their bug to see — the registry has no entry
    // to fall back to, and silently inventing one would be worse than the
    // explicit spawn error.
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
      agent: Record<string, unknown> & { acp_command?: unknown[] };
    };

    expect(payload.agent.acp_command).toEqual([]);
  });

  it("leaves acp_command alone for an unknown acp_server key", () => {
    // Future SDK adds a new provider before canvas's local mirror picks
    // it up: we don't recognise the key, so we can't expand the command
    // — but we also don't crash, and don't silently substitute one of
    // the known commands. The agent-server will produce the same
    // IndexError as before, which is the correct surface for "your
    // local canvas is out of date with the SDK."
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
      agent: Record<string, unknown> & { acp_command?: unknown[] };
    };

    expect(payload.agent.acp_command).toEqual([]);
  });

  it("treats acp_model: '' (empty string) as 'no override'", () => {
    // The form may carry an empty string after a user clears the model
    // input; the agent-server expects ``null`` for "use provider default."
    // Empty strings would pass the spawn but bias model selection on
    // some providers (e.g. claude-agent-acp's _meta would set
    // ``model: ''``).
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
      agent: Record<string, unknown> & { acp_model?: unknown };
    };

    // ``buildConfiguredAcpAgentSettings`` already filters undefined +
    // null; the empty string falls through, which is a known nit. The
    // adapter's contract is "forward what settings says"; the
    // canonicalisation belongs in the save path
    // (``agent-settings.tsx::handleSave`` already does
    // ``acpModel.trim() || null``). Pin the current behaviour so a
    // future change to either side is a deliberate decision.
    expect(payload.agent.acp_model).toBe("");
  });

  it("ACP → OpenHands → ACP round trip leaves no field leakage", () => {
    // Toggling agent_kind via the UI should not let stale ``acp_*``
    // state pollute an OpenHands run, and (in the reverse direction)
    // shouldn't let LLM/condenser/MCP state pollute an ACP payload.
    // We exercise both legs here against the same starting settings
    // shape so the round-trip is provable, not just inferred from the
    // single-direction tests.

    const baseAcpSettings = {
      ...DEFAULT_SETTINGS,
      agent_settings: {
        schema_version: 1,
        agent_kind: "acp",
        acp_server: "claude-code",
        acp_command: [],
        acp_env: { ANTHROPIC_API_KEY: "user-set-via-api" },
        acp_model: "claude-opus-4-5",
        // LLM-only crud that would leak without the strip:
        agent: "CodeActAgent",
        llm: { model: "gpt-4o", api_key: "stale-from-prior-oh-run" },
        condenser: { enabled: true, max_size: 200 },
      },
    };

    // Leg 1: ACP → OpenHands. The OpenHands branch must drop every
    // acp_* field; the LLM block survives.
    const ohPayload = buildStartConversationRequest({
      settings: {
        ...baseAcpSettings,
        agent_settings: {
          ...baseAcpSettings.agent_settings,
          agent_kind: "openhands",
        },
      },
    }) as { agent: Record<string, unknown> & { llm: Record<string, unknown> } };

    expect(ohPayload.agent.kind).toBe("Agent");
    expect(ohPayload.agent.acp_command).toBeUndefined();
    expect(ohPayload.agent.acp_env).toBeUndefined();
    expect(ohPayload.agent.acp_model).toBeUndefined();
    expect(ohPayload.agent.acp_server).toBeUndefined();
    expect(ohPayload.agent.llm.model).toBe("gpt-4o");

    // Leg 2: OpenHands → ACP (back). The ACP branch must drop the
    // llm/condenser/agent fields; the acp_* state survives.
    const acpPayload = buildStartConversationRequest({
      settings: baseAcpSettings,
    }) as {
      agent: Record<string, unknown> & {
        acp_command?: unknown;
        acp_env?: unknown;
        acp_model?: unknown;
        llm?: unknown;
        condenser?: unknown;
      };
    };

    expect(acpPayload.agent.kind).toBe("ACPAgent");
    expect(acpPayload.agent.acp_command).toEqual([
      "npx",
      "-y",
      "@agentclientprotocol/claude-agent-acp",
    ]);
    expect(acpPayload.agent.acp_model).toBe("claude-opus-4-5");
    expect(acpPayload.agent.acp_env).toEqual({
      ANTHROPIC_API_KEY: "user-set-via-api",
    });
    expect(acpPayload.agent.llm).toBeUndefined();
    expect(acpPayload.agent.condenser).toBeUndefined();
  });
});
