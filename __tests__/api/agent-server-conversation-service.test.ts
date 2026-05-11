import {
  ConversationClient,
  FileClient,
  SettingsClient,
} from "@openhands/typescript-client/clients";
import axios from "axios";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

vi.mock("axios");

const {
  mockHttpGet,
  mockHttpPost,
  mockHttpDelete,
  mockConversationClient,
  mockFileClient,
  mockSettingsClient,
  mockGetSettings,
  mockGetSettingsForConversation,
} = vi.hoisted(() => ({
  mockHttpGet: vi.fn(),
  mockHttpPost: vi.fn(),
  mockHttpDelete: vi.fn(),
  mockConversationClient: vi.fn(),
  mockFileClient: vi.fn(),
  mockSettingsClient: vi.fn(),
  mockGetSettings: vi.fn(),
  mockGetSettingsForConversation: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", async () => {
  const actual = await vi.importActual<
    typeof import("@openhands/typescript-client/clients")
  >("@openhands/typescript-client/clients");
  return {
    ...actual,
    ConversationClient: vi.fn(function ConversationClientMock() {
      return mockConversationClient();
    }),
    FileClient: vi.fn(function FileClientMock() {
      return mockFileClient();
    }),
    SettingsClient: vi.fn(function SettingsClientMock() {
      return mockSettingsClient();
    }),
    VSCodeClient: vi.fn(function VSCodeClientMock() {
      return { getUrl: vi.fn() };
    }),
  };
});

vi.mock("#/api/agent-server-config", () => ({
  DEFAULT_WORKING_DIR: "workspace/project",
  getAgentServerBaseUrl: vi.fn(() => "http://localhost:54928"),
  getAgentServerSessionApiKey: vi.fn(() => "test-api-key"),
  getAgentServerWorkingDir: vi.fn(() => "/workspace/project/agent-canvas"),
  buildConversationWorkingDir: vi.fn(
    (id: string) => `/state/workspaces/${id.replace(/-/g, "")}`,
  ),
  getConfiguredWorkerUrls: vi.fn(() => []),
  shouldLoadPublicSkills: vi.fn(() => true),
}));

vi.mock("#/api/settings-service/settings-service.api", () => ({
  default: {
    getSettings: mockGetSettings,
    getSettingsForConversation: mockGetSettingsForConversation,
  },
}));

describe("AgentServerConversationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpGet.mockReset();
    mockHttpPost.mockReset();
    mockHttpDelete.mockReset();
    vi.mocked(ConversationClient).mockClear();
    vi.mocked(FileClient).mockClear();
    vi.mocked(SettingsClient).mockClear();

    mockConversationClient.mockReturnValue({
      createConversation: async (payload: unknown) => {
        const response = await mockHttpPost("/api/conversations", payload);
        return response.data;
      },
      getConversations: async (conversationIds: string[]) => {
        const response = await mockHttpGet("/api/conversations", {
          params: { ids: conversationIds },
        });
        return response.data;
      },
      deleteConversation: async (conversationId: string) => {
        const response = await mockHttpDelete(
          `/api/conversations/${conversationId}`,
        );
        return response.data;
      },
      searchConversations: vi.fn(),
      getConversation: vi.fn(),
      sendEvent: vi.fn(),
      updateConversation: vi.fn(),
    });
    mockFileClient.mockReturnValue({
      downloadTextFile: async (path: string) => {
        const response = await mockHttpGet("/api/file/download", {
          params: { path },
          responseType: "arrayBuffer",
        });
        return new TextDecoder().decode(response.data);
      },
      downloadTrajectory: async (conversationId: string) => {
        const response = await mockHttpGet(
          `/api/file/download-trajectory/${conversationId}`,
          { responseType: "blob" },
        );
        return response.data;
      },
    });
    mockSettingsClient.mockReturnValue({
      listSecrets: vi.fn().mockResolvedValue({ secrets: [] }),
    });
  });

  describe("readConversationFile", () => {
    it("downloads the plan from the conversation's own working_dir when no filePath is provided", async () => {
      const encodedPlan = new TextEncoder().encode("# PLAN content").buffer;
      mockHttpGet.mockImplementation((url: string) => {
        if (url === "/api/conversations") {
          return Promise.resolve({
            data: [
              {
                id: "conv-123",
                created_at: "2024-01-01",
                updated_at: "2024-01-01",
                workspace: {
                  working_dir: "/workspace/project/agent-canvas/conv-123",
                },
              },
            ],
          });
        }
        return Promise.resolve({ data: encodedPlan });
      });

      const content =
        await AgentServerConversationService.readConversationFile("conv-123");

      expect(content).toBe("# PLAN content");
      expect(ConversationClient).toHaveBeenCalledWith({
        host: "http://localhost:54928",
        apiKey: "test-api-key",
        workingDir: "/workspace/project/agent-canvas",
      });
      expect(FileClient).toHaveBeenCalledWith({
        host: "http://localhost:54928",
        apiKey: "test-api-key",
        workingDir: "/workspace/project/agent-canvas",
      });
      expect(mockHttpGet).toHaveBeenCalledWith(
        "/api/file/download",
        expect.objectContaining({
          params: {
            path: "/workspace/project/agent-canvas/conv-123/.agents_tmp/PLAN.md",
          },
          responseType: "arrayBuffer",
        }),
      );
    });

    it("rejects explicit file paths outside the conversation workspace", async () => {
      mockHttpGet.mockImplementation((url: string) => {
        if (url === "/api/conversations") {
          return Promise.resolve({
            data: [
              {
                id: "conv-123",
                created_at: "2024-01-01",
                updated_at: "2024-01-01",
                workspace: {
                  working_dir: "/workspace/project/agent-canvas/conv-123",
                },
              },
            ],
          });
        }
        return Promise.resolve({ data: new ArrayBuffer(0) });
      });

      await expect(
        AgentServerConversationService.readConversationFile(
          "conv-123",
          "/workspace/project/agent-canvas/other/PLAN.md",
        ),
      ).rejects.toThrow(
        "Conversation file path must stay inside the workspace",
      );
      expect(mockHttpGet).not.toHaveBeenCalledWith(
        "/api/file/download",
        expect.anything(),
      );
    });
  });

  describe("createConversation", () => {
    it("generates a unique conversation_id and isolated working_dir per call", async () => {
      mockGetSettings.mockResolvedValue({
        agent_settings: { llm: { model: "gpt-4o" } },
        conversation_settings: {},
      });
      mockGetSettingsForConversation.mockResolvedValue({
        agentSettings: { llm: { model: "gpt-4o" } },
        conversationSettings: {},
        secretsEncrypted: true,
      });
      mockHttpPost.mockResolvedValue({
        data: {
          id: "ignored-server-id",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        },
      });

      await AgentServerConversationService.createConversation();
      await AgentServerConversationService.createConversation();

      expect(ConversationClient).toHaveBeenCalledWith({
        host: "http://localhost:54928",
        apiKey: "test-api-key",
        workingDir: "/workspace/project/agent-canvas",
      });
      expect(mockHttpPost).toHaveBeenCalledTimes(2);
      const [firstCall, secondCall] = mockHttpPost.mock.calls;
      const firstPayload = firstCall[1] as {
        conversation_id: string;
        workspace: { working_dir: string };
      };
      const secondPayload = secondCall[1] as {
        conversation_id: string;
        workspace: { working_dir: string };
      };

      expect(firstPayload.conversation_id).toBeTruthy();
      expect(secondPayload.conversation_id).toBeTruthy();
      expect(firstPayload.conversation_id).not.toBe(
        secondPayload.conversation_id,
      );
      const firstHex = firstPayload.conversation_id.replace(/-/g, "");
      const secondHex = secondPayload.conversation_id.replace(/-/g, "");
      expect(firstPayload.workspace.working_dir).toBe(
        `/state/workspaces/${firstHex}`,
      );
      expect(secondPayload.workspace.working_dir).toBe(
        `/state/workspaces/${secondHex}`,
      );
    });
  });

  describe("downloadConversation local branch", () => {
    beforeEach(() => {
      window.localStorage.clear();
      __resetActiveStoreForTests();
    });

    afterEach(() => {
      window.localStorage.clear();
      __resetActiveStoreForTests();
    });

    it("hits the local /api/file/download-trajectory endpoint with responseType blob when active backend is local", async () => {
      const zipBlob = new Blob(["zip-bytes"], { type: "application/zip" });
      mockHttpGet.mockResolvedValue({ data: zipBlob });

      const result =
        await AgentServerConversationService.downloadConversation("conv-abc");

      expect(mockHttpGet).toHaveBeenCalledWith(
        "/api/file/download-trajectory/conv-abc",
        expect.objectContaining({ responseType: "blob" }),
      );
      expect(result).toBe(zipBlob);
    });
  });

  describe("deleteConversation local branch", () => {
    beforeEach(() => {
      window.localStorage.clear();
      __resetActiveStoreForTests();
    });

    afterEach(() => {
      window.localStorage.clear();
      __resetActiveStoreForTests();
    });

    it("hits the local /api/conversations/{id} endpoint when active backend is local", async () => {
      mockHttpDelete.mockResolvedValue({ data: undefined });

      await AgentServerConversationService.deleteConversation("conv-abc");

      expect(mockHttpDelete).toHaveBeenCalledWith(
        "/api/conversations/conv-abc",
      );
    });
  });

  describe("conversation update fallbacks", () => {
    it("throws a useful error when repository update cannot reload the conversation", async () => {
      mockHttpGet.mockResolvedValue({ data: [] });

      await expect(
        AgentServerConversationService.updateConversationRepository(
          "missing-conv",
          "OpenHands/agent-canvas",
        ),
      ).rejects.toThrow("Conversation missing-conv was not found");
    });

    it("throws a useful error when title update cannot reload the conversation", async () => {
      mockHttpGet.mockResolvedValue({ data: [] });

      await expect(
        AgentServerConversationService.updateConversationTitle(
          "missing-conv",
          "New title",
        ),
      ).rejects.toThrow("Conversation missing-conv was not found");
    });

    it("normalizes conversation list items with missing timestamps", async () => {
      mockHttpGet.mockResolvedValue({
        data: [
          {
            id: "conv-no-timestamps",
            title: "Conversation without timestamps",
          },
        ],
      });

      const [conversation] =
        await AgentServerConversationService.batchGetAppConversations([
          "conv-no-timestamps",
        ]);

      expect(conversation).toMatchObject({
        id: "conv-no-timestamps",
        created_at: "1970-01-01T00:00:00.000Z",
        updated_at: "1970-01-01T00:00:00.000Z",
      });
    });

    it("throws a user-friendly error for unusable conversation list responses", async () => {
      mockHttpGet.mockResolvedValue({ data: [{ title: "missing id" }] });

      await expect(
        AgentServerConversationService.batchGetAppConversations(["missing-id"]),
      ).rejects.toThrow(
        "Unable to load conversations because the selected agent server returned",
      );
    });

    it("sanitizes malformed optional conversation fields", async () => {
      mockHttpGet.mockResolvedValue({
        data: [
          {
            id: "conv-malformed-fields",
            title: "Conversation with malformed fields",
            metrics: {
              accumulated_cost: "1.23",
              max_budget_per_task: 10,
              accumulated_token_usage: {
                prompt_tokens: "123",
                completion_tokens: 4,
              },
            },
            agent: "not an agent object",
            workspace: "not a workspace object",
          },
        ],
      });

      const [conversation] =
        await AgentServerConversationService.batchGetAppConversations([
          "conv-malformed-fields",
        ]);

      expect(conversation?.metrics).toEqual({
        accumulated_cost: null,
        max_budget_per_task: 10,
        accumulated_token_usage: {
          prompt_tokens: 0,
          completion_tokens: 4,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          context_window: 0,
          per_turn_token: 0,
        },
      });
      expect(conversation?.llm_model).toBeTruthy();
      expect(conversation?.workspace?.working_dir).toBe(
        "/workspace/project/agent-canvas",
      );
    });
  });

  describe("cloud branches", () => {
    const cloudBackend: Backend = {
      id: "prod",
      name: "Production",
      host: "https://app.all-hands.dev",
      apiKey: "bearer-token",
      kind: "cloud",
    };

    beforeEach(() => {
      window.localStorage.clear();
      __resetActiveStoreForTests();
      setRegisteredBackends([cloudBackend]);
      setActiveSelection({ backendId: cloudBackend.id });
      vi.mocked(axios.post).mockReset();
    });

    afterEach(() => {
      window.localStorage.clear();
      __resetActiveStoreForTests();
    });

    it("forwards parent_conversation_id, agent_type, and sandbox_id to the cloud createConversation payload", async () => {
      // Arrange
      vi.mocked(axios.post).mockResolvedValue({
        data: {
          id: "task-1",
          status: "WORKING",
          app_conversation_id: null,
          agent_server_url: null,
          request: {},
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        },
      });

      // Act
      await AgentServerConversationService.createConversation(
        undefined,
        undefined,
        undefined,
        null,
        undefined,
        "parent-conv-1",
        "plan",
        "sandbox-9",
      );

      // Assert
      const [, body] = vi.mocked(axios.post).mock.calls[0]!;
      const upstream = body as {
        path: string;
        body: Record<string, unknown>;
      };
      expect(upstream.path).toBe("/api/v1/app-conversations");
      expect(upstream.body).toMatchObject({
        parent_conversation_id: "parent-conv-1",
        agent_type: "plan",
        sandbox_id: "sandbox-9",
      });
    });

    it("routes readConversationFile to the SaaS file endpoint with the file_path query param", async () => {
      // Arrange
      vi.mocked(axios.post).mockResolvedValue({ data: "# PLAN content" });

      // Act
      const content =
        await AgentServerConversationService.readConversationFile(
          "conv-cloud-1",
        );

      // Assert
      expect(content).toBe("# PLAN content");
      const [, body] = vi.mocked(axios.post).mock.calls[0]!;
      const upstream = body as { method: string; path: string };
      expect(upstream.method).toBe("GET");
      expect(upstream.path).toBe(
        "/api/v1/app-conversations/conv-cloud-1/file?file_path=%2Fworkspace%2Fproject%2F.agents_tmp%2FPLAN.md",
      );
    });
  });
});
