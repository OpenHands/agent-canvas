import { describe, expect, it, vi } from "vitest";

import {
  buildStartConversationRequest,
  getDefaultConversationTitle,
  toAppConversation,
  type DirectConversationInfo,
} from "#/api/agent-server-adapter";
import { DEFAULT_SETTINGS } from "#/services/settings";

const { mockGetAgentServerWorkingDir } = vi.hoisted(() => ({
  mockGetAgentServerWorkingDir: vi.fn(
    () => "/workspace/project/agent-canvas",
  ),
}));

vi.mock("#/api/agent-server-config", () => ({
  getAgentServerBaseUrl: vi.fn(() => "http://127.0.0.1:8000"),
  getAgentServerSessionApiKey: vi.fn(() => null),
  getAgentServerWorkingDir: mockGetAgentServerWorkingDir,
  getConfiguredWorkerUrls: vi.fn(() => []),
}));

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
      { name: "browser_tool_set", params: {} },
    ]);
    expect(payload.agent.agent).toBeUndefined();
    expect(payload.workspace.working_dir).toBe(
      "/workspace/project/agent-canvas",
    );
    expect(payload.max_iterations).toBe(123);
    expect(payload.initial_message.content[0]?.text).toBe("hello");
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
    expect(payload.tool_module_qualnames).toEqual({
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
});
