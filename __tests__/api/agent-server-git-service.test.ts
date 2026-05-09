import { describe, test, expect, vi, beforeEach } from "vitest";
import AgentServerGitService from "../../src/api/git-service/agent-server-git-service.api";

const { mockGitChanges, mockGitDiff, mockCreateRemoteWorkspace } = vi.hoisted(
  () => ({
    mockGitChanges: vi.fn(),
    mockGitDiff: vi.fn(),
    mockCreateRemoteWorkspace: vi.fn(),
  }),
);

vi.mock("../../src/api/typescript-client", () => ({
  createRemoteWorkspace: mockCreateRemoteWorkspace,
}));

describe("AgentServerGitService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGitChanges.mockReset();
    mockGitDiff.mockReset();
    mockCreateRemoteWorkspace.mockReturnValue({
      gitChanges: mockGitChanges,
      gitDiff: mockGitDiff,
    });
  });

  describe("getGitChanges", () => {
    test("throws when response is not an array (dead runtime returns HTML)", async () => {
      mockGitChanges.mockResolvedValue("<!DOCTYPE html><html>...</html>");

      await expect(
        AgentServerGitService.getGitChanges(
          "http://localhost:3000/api/conversations/123",
          "test-api-key",
          "/workspace",
        ),
      ).rejects.toThrow("Invalid response from runtime");
    });

    test("passes conversation URL and session key to the runtime workspace", async () => {
      mockGitChanges.mockResolvedValue([]);

      await AgentServerGitService.getGitChanges(
        "http://localhost:3000/api/conversations/123",
        "my-session-key",
        "/workspace/project",
      );

      expect(mockCreateRemoteWorkspace).toHaveBeenCalledWith({
        conversationUrl: "http://localhost:3000/api/conversations/123",
        sessionApiKey: "my-session-key",
      });
      expect(mockGitChanges).toHaveBeenCalledWith("/workspace/project");
    });

    test("preserves slashes in path when using workspace helper", async () => {
      mockGitChanges.mockResolvedValue([]);

      const pathWithSlashes = "/workspace/project/src/components";
      await AgentServerGitService.getGitChanges(
        "http://localhost:3000/api/conversations/123",
        "test-api-key",
        pathWithSlashes,
      );

      expect(mockGitChanges).toHaveBeenCalledWith(pathWithSlashes);
    });

    test("maps V1 git statuses to V0 format", async () => {
      mockGitChanges.mockResolvedValue([
        { status: "ADDED", path: "new-file.ts" },
        { status: "DELETED", path: "removed-file.ts" },
        { status: "UPDATED", path: "changed-file.ts" },
        { status: "MOVED", path: "renamed-file.ts" },
      ]);

      const result = await AgentServerGitService.getGitChanges(
        "http://localhost:3000/api/conversations/123",
        "test-api-key",
        "/workspace",
      );

      expect(result).toEqual([
        { status: "A", path: "new-file.ts" },
        { status: "D", path: "removed-file.ts" },
        { status: "M", path: "changed-file.ts" },
        { status: "R", path: "renamed-file.ts" },
      ]);
    });
  });

  describe("getGitChangeDiff", () => {
    test("passes conversation URL and path to runtime workspace diff helper", async () => {
      mockGitDiff.mockResolvedValue({
        diff: "--- a/file.ts\n+++ b/file.ts\n...",
      });

      await AgentServerGitService.getGitChangeDiff(
        "http://localhost:3000/api/conversations/123",
        "test-api-key",
        "/workspace/project/file.ts",
      );

      expect(mockCreateRemoteWorkspace).toHaveBeenCalledWith({
        conversationUrl: "http://localhost:3000/api/conversations/123",
        sessionApiKey: "test-api-key",
      });
      expect(mockGitDiff).toHaveBeenCalledWith("/workspace/project/file.ts");
    });

    test("preserves slashes in file path when using workspace helper", async () => {
      mockGitDiff.mockResolvedValue({ diff: "diff content" });

      const filePath = "/workspace/project/src/components/Button.tsx";
      await AgentServerGitService.getGitChangeDiff(
        "http://localhost:3000/api/conversations/123",
        "test-api-key",
        filePath,
      );

      expect(mockGitDiff).toHaveBeenCalledWith(filePath);
    });

    test("returns the diff data from the response", async () => {
      const expectedDiff = {
        diff: "--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n+new line",
      };
      mockGitDiff.mockResolvedValue(expectedDiff);

      const result = await AgentServerGitService.getGitChangeDiff(
        "http://localhost:3000/api/conversations/123",
        "test-api-key",
        "/workspace/file.ts",
      );

      expect(result).toEqual({
        modified: "",
        original: "",
        diff: expectedDiff.diff,
      });
    });
  });
});
