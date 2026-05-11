import { describe, expect, it, vi, beforeEach } from "vitest";
import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";

import ConversationService from "#/api/conversation-service/conversation-service.api";

const fileUploadMock = vi.fn();

vi.mock("@openhands/typescript-client/workspace/remote-workspace", () => ({
  RemoteWorkspace: vi.fn(function RemoteWorkspaceMock() {
    return { fileUpload: fileUploadMock };
  }),
}));

function makeFile(name: string) {
  return new File(["content"], name, { type: "text/plain" });
}

describe("ConversationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ConversationService.setCurrentConversation(null);
  });

  describe("uploadFiles", () => {
    it("uploads files through RemoteWorkspace and reports successes", async () => {
      fileUploadMock.mockResolvedValue(undefined);

      const result = await ConversationService.uploadFiles("conv-1", [
        makeFile("a.txt"),
        makeFile("b.txt"),
      ]);

      expect(RemoteWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          host: expect.any(String),
          workingDir: expect.any(String),
        }),
      );
      expect(fileUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "a.txt" }),
        "/workspace/a.txt",
      );
      expect(fileUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "b.txt" }),
        "/workspace/b.txt",
      );
      expect(result).toEqual({
        uploaded_files: ["a.txt", "b.txt"],
        skipped_files: [],
      });
    });

    it("uses the current conversation session key and reports per-file failures", async () => {
      ConversationService.setCurrentConversation({
        id: "conv-1",
        session_api_key: "session-key",
      } as never);
      fileUploadMock
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("too large"));

      const result = await ConversationService.uploadFiles("conv-1", [
        makeFile("ok.txt"),
        makeFile("bad.txt"),
      ]);

      expect(RemoteWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "session-key" }),
      );
      expect(result).toEqual({
        uploaded_files: ["ok.txt"],
        skipped_files: [{ name: "bad.txt", reason: "too large" }],
      });
    });
  });
});
