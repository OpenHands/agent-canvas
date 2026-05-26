import { describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceUploadPath,
  getSafeUploadFileName,
  resolveConversationUploadWorkingDir,
  toAbsoluteWorkspacePath,
} from "#/api/workspace-upload-path";

vi.mock("#/api/conversation-service/agent-server-conversation-service.api", () => ({
  default: {
    resolveConversationWorkingDir: vi.fn(
      async (id: string) => `/workspace/project/${id.replace(/-/g, "")}`,
    ),
  },
}));

describe("workspace-upload-path", () => {
  it("normalizes relative working dirs to absolute paths", () => {
    expect(toAbsoluteWorkspacePath("workspace/project")).toBe(
      "/workspace/project",
    );
    expect(buildWorkspaceUploadPath("a.txt", "workspace/project")).toBe(
      "/workspace/project/a.txt",
    );
  });

  it("strips path segments from file names", () => {
    expect(getSafeUploadFileName("../../evil.txt")).toBe("evil.txt");
    expect(buildWorkspaceUploadPath("../../evil.txt", "/workspace/project")).toBe(
      "/workspace/project/evil.txt",
    );
  });

  it("prefers the active conversation workspace when ids match", async () => {
    const dir = await resolveConversationUploadWorkingDir("conv-uuid", {
      id: "conv-uuid",
      workspace: { working_dir: "/workspace/project/custom" },
    } as never);

    expect(dir).toBe("/workspace/project/custom");
  });

  it("resolves per-conversation dirs for UUID ids", async () => {
    const dir = await resolveConversationUploadWorkingDir(
      "550e8400-e29b-41d4-a716-446655440000",
      null,
    );

    expect(dir).toBe(
      "/workspace/project/550e8400e29b41d4a716446655440000",
    );
  });
});
