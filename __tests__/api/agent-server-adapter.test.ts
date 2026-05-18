import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
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

  it("includes task_tool_set when the server advertises it but not browser tools", () => {
    mockIsAgentServerToolAvailable.mockImplementation(
      (toolName: string) => toolName === "task_tool_set",
    );

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
      { name: "task_tool_set", params: {} },
    ]);
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
        mode: "dev:docker",
        agent_host_alias: "host.docker.internal",
        services: {
          agent_server: {
            description: "self",
            url_from_agent: "http://localhost:8000",
          },
          automation: {
            description: "automations",
            url_from_agent: "http://host.docker.internal:18001",
            api_prefix: "/api/automation",
            docs_url: "http://host.docker.internal:18001/api/automation/docs",
            openapi_url:
              "http://host.docker.internal:18001/api/automation/openapi.json",
            auth_env_var: "OPENHANDS_AUTOMATION_API_KEY",
          },
        },
      }),
    );
    const suffix = buildRuntimeServicesSystemSuffix();
    expect(suffix).toBeDefined();
    expect(suffix).toContain("<RUNTIME_SERVICES>");
    expect(suffix).toContain("dev:docker");
    expect(suffix).toContain("http://localhost:8000");
    expect(suffix).toContain("http://host.docker.internal:18001");
    expect(suffix).toContain(
      "http://host.docker.internal:18001/api/automation/docs",
    );
    expect(suffix).toContain("X-API-Key: $OPENHANDS_AUTOMATION_API_KEY");
    expect(suffix).toContain("</RUNTIME_SERVICES>");
    // The "don't guess" line should reference the actual agent-server URL
    // for this stack, not a hardcoded :8000. We pinned :8000 here but the
    // assertion specifically anchors on the URL we supplied.
    expect(suffix).toContain(
      "In particular, http://localhost:8000 inside your sandbox is the Agent Server",
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
        mode: "dev:docker",
        services: {
          agent_server: { url_from_agent: "http://localhost:8000" },
          frontend: {
            kind: "static",
            description: "Static-file server hosting the agent-canvas build.",
            url_from_agent: "http://host.docker.internal:3001",
          },
        },
      }),
    );
    const suffix = buildRuntimeServicesSystemSuffix();
    expect(suffix).toContain("* Frontend: http://host.docker.internal:3001");
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
        mode: "dev:docker",
        services: {
          agent_server: { url_from_agent: "http://localhost:8000" },
          automation: {
            url_from_agent: "http://host.docker.internal:18001",
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
