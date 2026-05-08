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
  mockFileUpload,
  mockCreateHttpClient,
  mockCreateRemoteWorkspace,
  mockGetSettings,
  mockGetSettingsForConversation,
} = vi.hoisted(() => ({
  mockHttpGet: vi.fn(),
  mockHttpPost: vi.fn(),
  mockHttpDelete: vi.fn(),
  mockFileUpload: vi.fn(),
  mockCreateHttpClient: vi.fn(),
  mockCreateRemoteWorkspace: vi.fn(),
  mockGetSettings: vi.fn(),
  mockGetSettingsForConversation: vi.fn(),
}));

vi.mock("#/api/typescript-client", () => ({
  createHttpClient: mockCreateHttpClient,
  createRemoteWorkspace: mockCreateRemoteWorkspace,
  createVSCodeClient: vi.fn(),
}));

vi.mock("#/api/agent-server-config", () => ({
  DEFAULT_WORKING_DIR: "workspace/project",
  getAgentServerBaseUrl: vi.fn(() => "http://localhost:54928"),
  getAgentServerSessionApiKey: vi.fn(() => "test-api-key"),
  getAgentServerWorkingDir: vi.fn(() => "/workspace/project/agent-canvas"),
  buildConversationWorkingDir: vi.fn(
    (id: string) => `/state/workspaces/${id.replace(/-/g, "")}`,
  ),
  getConfiguredWorkerUrls: vi.fn(() => []),
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
    mockFileUpload.mockReset();

    mockCreateHttpClient.mockReturnValue({
      get: mockHttpGet,
      post: mockHttpPost,
      patch: vi.fn(),
      delete: mockHttpDelete,
    });
    mockCreateRemoteWorkspace.mockReturnValue({
      fileUpload: mockFileUpload,
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
        await AgentServerConversationService.readConversationFile("conv-cloud-1");

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

  describe("uploadFile", () => {
    it("uses query params for file upload path", async () => {
      const file = new File(["test content"], "test.txt", {
        type: "text/plain",
      });
      const uploadPath = "/workspace/custom/path.txt";

      await AgentServerConversationService.uploadFile(
        "http://localhost:54928/api/conversations/conv-123",
        "test-api-key",
        file,
        uploadPath,
      );

      expect(mockCreateRemoteWorkspace).toHaveBeenCalledWith({
        sessionApiKey: "test-api-key",
      });
      expect(mockFileUpload).toHaveBeenCalledWith(file, uploadPath);
    });

    it("uses default workspace path when no path provided", async () => {
      const file = new File(["test content"], "myfile.txt", {
        type: "text/plain",
      });

      await AgentServerConversationService.uploadFile(
        "http://localhost:54928/api/conversations/conv-123",
        "test-api-key",
        file,
      );

      expect(mockFileUpload).toHaveBeenCalledWith(
        file,
        "/workspace/myfile.txt",
      );
    });

    it("passes through the selected session key for uploads", async () => {
      const file = new File(["test content"], "test.txt", {
        type: "text/plain",
      });

      await AgentServerConversationService.uploadFile(
        "http://localhost:54928/api/conversations/conv-123",
        "my-session-key",
        file,
      );

      expect(mockCreateRemoteWorkspace).toHaveBeenCalledWith({
        sessionApiKey: "my-session-key",
      });
    });
  });
});
