import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { uploadFilesToConversation } from "#/api/conversation-file-upload.api";

const fileUploadMock = vi.fn();

vi.mock("@openhands/typescript-client/workspace/remote-workspace", () => ({
  RemoteWorkspace: vi.fn(function RemoteWorkspaceMock() {
    return { fileUpload: fileUploadMock };
  }),
}));

const batchGetCloudConversations = vi.fn();

vi.mock("#/api/cloud/conversation-service.api", () => ({
  batchGetCloudConversations: (...args: unknown[]) =>
    batchGetCloudConversations(...args),
}));

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "Cloud",
  host: "https://app.all-hands.dev",
  apiKey: "cloud-token",
  kind: "cloud",
};

function makeFile(name: string) {
  return new File(["content"], name, { type: "text/plain" });
}

describe("uploadFilesToConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    __resetActiveStoreForTests();
    fileUploadMock.mockResolvedValue(undefined);
    batchGetCloudConversations.mockReset();
  });

  it("uploads local conversations through the bundled agent-server host", async () => {
    setRegisteredBackends([
      {
        id: "local-1",
        name: "Local",
        host: "http://127.0.0.1:18000",
        apiKey: "local-key",
        kind: "local",
      },
    ]);
    setActiveSelection({ backendId: "local-1" });

    const result = await uploadFilesToConversation("conv-1", [
      makeFile("a.txt"),
    ]);

    expect(fileUploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "a.txt" }),
      "/workspace/project/a.txt",
    );
    expect(result.uploaded_files).toEqual(["a.txt"]);
    expect(batchGetCloudConversations).not.toHaveBeenCalled();
  });

  it("uploads cloud conversations against the provisioned runtime URL", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    batchGetCloudConversations.mockResolvedValue([
      {
        id: "1717df59-63ee-43bf-b32a-83428d3efdc8",
        conversation_url:
          "http://runtime.example.dev/api/conversations/1717df59-63ee-43bf-b32a-83428d3efdc8",
        session_api_key: "runtime-session-key",
        workspace: { working_dir: "/workspace/project" },
      },
    ]);

    const conversationId = "1717df59-63ee-43bf-b32a-83428d3efdc8";
    const result = await uploadFilesToConversation(conversationId, [
      makeFile("notes.md"),
    ]);

    expect(batchGetCloudConversations).toHaveBeenCalledWith([conversationId]);
    expect(RemoteWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "http://runtime.example.dev",
        apiKey: "runtime-session-key",
      }),
    );
    expect(fileUploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "notes.md" }),
      "/workspace/project/notes.md",
    );
    expect(result.uploaded_files).toEqual(["notes.md"]);
  });
});
