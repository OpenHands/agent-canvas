import { describe, expect, it, vi, beforeEach } from "vitest";
import V1ConversationService from "#/api/conversation-service/v1-conversation-service.api";
import { getVSCodeBaseUrl } from "#/api/agent-server-config";

const {
  mockHttpGet,
  mockHttpPost,
  mockFileUpload,
  mockCreateHttpClient,
  mockCreateRemoteWorkspace,
  mockGetSettings,
  mockCreateVSCodeClient,
} = vi.hoisted(() => ({
  mockHttpGet: vi.fn(),
  mockHttpPost: vi.fn(),
  mockFileUpload: vi.fn(),
  mockCreateHttpClient: vi.fn(),
  mockCreateRemoteWorkspace: vi.fn(),
  mockGetSettings: vi.fn(),
  mockCreateVSCodeClient: vi.fn(),
}));

vi.mock("#/api/typescript-client", () => ({
  createHttpClient: mockCreateHttpClient,
  createRemoteWorkspace: mockCreateRemoteWorkspace,
  createVSCodeClient: mockCreateVSCodeClient,
}));

vi.mock("#/api/agent-server-config", () => ({
  DEFAULT_WORKING_DIR: "workspace/project",
  getAgentServerBaseUrl: vi.fn(() => "http://localhost:54928"),
  getAgentServerSessionApiKey: vi.fn(() => "test-api-key"),
  getAgentServerWorkingDir: vi.fn(() => "/workspace/project/agent-server-gui"),
  buildConversationWorkingDir: vi.fn(
    (id: string) => `/state/workspaces/${id.replace(/-/g, "")}`,
  ),
  getConfiguredWorkerUrls: vi.fn(() => []),
  getVSCodeBaseUrl: vi.fn(() => undefined),
}));

vi.mock("#/api/settings-service/settings-service.api", () => ({
  default: {
    getSettings: mockGetSettings,
  },
}));

describe("V1ConversationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpGet.mockReset();
    mockHttpPost.mockReset();
    mockFileUpload.mockReset();

    mockCreateHttpClient.mockReturnValue({
      get: mockHttpGet,
      post: mockHttpPost,
      patch: vi.fn(),
      delete: vi.fn(),
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
                  working_dir: "/workspace/project/agent-server-gui/conv-123",
                },
              },
            ],
          });
        }
        return Promise.resolve({ data: encodedPlan });
      });

      const content =
        await V1ConversationService.readConversationFile("conv-123");

      expect(content).toBe("# PLAN content");
      expect(mockHttpGet).toHaveBeenCalledWith(
        "/api/file/download",
        expect.objectContaining({
          params: {
            path: "/workspace/project/agent-server-gui/conv-123/.agents_tmp/PLAN.md",
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
      mockHttpPost.mockResolvedValue({
        data: {
          id: "ignored-server-id",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        },
      });

      await V1ConversationService.createConversation();
      await V1ConversationService.createConversation();

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

  describe("uploadFile", () => {
    it("uses query params for file upload path", async () => {
      const file = new File(["test content"], "test.txt", {
        type: "text/plain",
      });
      const uploadPath = "/workspace/custom/path.txt";

      await V1ConversationService.uploadFile(
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

      await V1ConversationService.uploadFile(
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

      await V1ConversationService.uploadFile(
        "http://localhost:54928/api/conversations/conv-123",
        "my-session-key",
        file,
      );

      expect(mockCreateRemoteWorkspace).toHaveBeenCalledWith({
        sessionApiKey: "my-session-key",
      });
    });
  });

  describe("getVSCodeUrl", () => {
    // Regression: previously the GUI passed window.location.origin (port 3001
    // in dev), so the backend returned an URL pointing at the GUI itself
    // instead of openvscode-server (port 8001). The fix routes the baseUrl
    // through getVSCodeBaseUrl(), which honors VITE_VSCODE_BASE_URL.
    it("forwards the configured VS Code base URL to the typescript client", async () => {
      // Arrange
      const mockGetUrl = vi.fn().mockResolvedValue("http://localhost:8001/?tkn=abc");
      mockCreateVSCodeClient.mockReturnValue({ getUrl: mockGetUrl });
      vi.mocked(getVSCodeBaseUrl).mockReturnValue("http://localhost:8001");
      mockHttpGet.mockResolvedValue({
        data: [
          {
            id: "conv-123",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
            workspace: { working_dir: "/workspace/agent-server-gui/conv-123" },
          },
        ],
      });

      // Act
      const result = await V1ConversationService.getVSCodeUrl(
        "conv-123",
        null,
        "test-api-key",
      );

      // Assert
      expect(mockCreateVSCodeClient).toHaveBeenCalledWith({
        sessionApiKey: "test-api-key",
      });
      expect(mockGetUrl).toHaveBeenCalledWith({
        baseUrl: "http://localhost:8001",
        workspaceDir: "/workspace/agent-server-gui/conv-123",
      });
      expect(result.vscode_url).toBe("http://localhost:8001/?tkn=abc");
    });
  });
});
