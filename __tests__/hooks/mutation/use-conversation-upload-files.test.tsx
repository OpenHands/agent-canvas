import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationUploadFiles } from "#/hooks/mutation/use-conversation-upload-files";

const fileUploadMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@openhands/typescript-client/workspace/remote-workspace", () => ({
  RemoteWorkspace: class {
    fileUpload = fileUploadMock;
  },
}));

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: vi.fn().mockReturnValue({}),
}));

function renderUploadHook() {
  return renderHook(() => useConversationUploadFiles(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    ),
  });
}

describe("useConversationUploadFiles", () => {
  beforeEach(() => {
    fileUploadMock.mockClear();
  });

  it("uploads files to the provided workingDir", async () => {
    const { result } = renderUploadHook();
    const file = new File(["content"], "test.png", { type: "image/png" });

    const response = await result.current.mutateAsync({
      conversationUrl: "http://localhost",
      sessionApiKey: "key",
      files: [file],
      workingDir: "/home/user/project",
    });

    await waitFor(() => {
      expect(fileUploadMock).toHaveBeenCalledWith(
        file,
        "/home/user/project/test.png",
      );
      expect(response.uploaded_files).toEqual([
        "/home/user/project/test.png",
      ]);
    });
  });

  it("falls back to /workspace when workingDir is null", async () => {
    const { result } = renderUploadHook();
    const file = new File(["content"], "readme.md");

    const response = await result.current.mutateAsync({
      conversationUrl: "http://localhost",
      sessionApiKey: "key",
      files: [file],
      workingDir: null,
    });

    await waitFor(() => {
      expect(fileUploadMock).toHaveBeenCalledWith(file, "/workspace/readme.md");
      expect(response.uploaded_files).toEqual(["/workspace/readme.md"]);
    });
  });

  it("falls back to /workspace when workingDir is undefined", async () => {
    const { result } = renderUploadHook();
    const file = new File(["content"], "data.csv");

    const response = await result.current.mutateAsync({
      conversationUrl: "http://localhost",
      sessionApiKey: "key",
      files: [file],
    });

    await waitFor(() => {
      expect(fileUploadMock).toHaveBeenCalledWith(file, "/workspace/data.csv");
      expect(response.uploaded_files).toEqual(["/workspace/data.csv"]);
    });
  });

  it("strips trailing slashes from workingDir", async () => {
    const { result } = renderUploadHook();
    const file = new File(["content"], "app.js");

    await result.current.mutateAsync({
      conversationUrl: "http://localhost",
      sessionApiKey: "key",
      files: [file],
      workingDir: "/home/user/project///",
    });

    await waitFor(() => {
      expect(fileUploadMock).toHaveBeenCalledWith(
        file,
        "/home/user/project/app.js",
      );
    });
  });

  it("reports failed uploads in skipped_files", async () => {
    fileUploadMock.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderUploadHook();
    const file = new File(["content"], "fail.txt");

    const response = await result.current.mutateAsync({
      conversationUrl: "http://localhost",
      sessionApiKey: "key",
      files: [file],
      workingDir: "/project",
    });

    await waitFor(() => {
      expect(response.uploaded_files).toEqual([]);
      expect(response.skipped_files).toEqual([
        { name: "fail.txt", reason: "Network error" },
      ]);
    });
  });
});
