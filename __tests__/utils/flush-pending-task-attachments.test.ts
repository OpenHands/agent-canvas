import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  setPendingTaskAttachments,
  usePendingTaskAttachmentsStore,
} from "#/stores/pending-task-attachments-store";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { flushPendingTaskAttachments } from "#/utils/flush-pending-task-attachments";

const sendMessageWithAttachments = vi.fn();

vi.mock("#/utils/send-message-with-attachments", () => ({
  sendMessageWithAttachments: (...args: unknown[]) =>
    sendMessageWithAttachments(...args),
}));

describe("flushPendingTaskAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOptimisticUserMessageStore.getState().clearPendingMessages();
    usePendingTaskAttachmentsStore.setState({ byTaskId: {} });

    sendMessageWithAttachments.mockResolvedValue({
      text: "hello",
      content: "hello",
      imageUrls: ["data:image/png;base64,abc"],
      fileUrls: [],
      timestamp: "2020-01-01T00:00:00.000Z",
    });
  });

  it("sends queued attachments to the real conversation id", async () => {
    const image = new File(["x"], "shot.png", { type: "image/png" });
    setPendingTaskAttachments("start-task-id", {
      content: "hello",
      images: [image],
      files: [],
      imagesMarkedUploadAsFile: [],
    });

    await flushPendingTaskAttachments(
      "start-task-id",
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(sendMessageWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        content: "hello",
      }),
    );
    expect(
      useOptimisticUserMessageStore.getState().pendingMessages,
    ).toHaveLength(1);
  });
});
