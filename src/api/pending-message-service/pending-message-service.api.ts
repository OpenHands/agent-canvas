import { createConversationClient } from "../typescript-client";
import type {
  PendingMessageResponse,
  QueuePendingMessageRequest,
} from "./pending-message-service.types";

class PendingMessageService {
  static async queueMessage(
    conversationId: string,
    message: QueuePendingMessageRequest,
  ): Promise<PendingMessageResponse> {
    await createConversationClient().sendEvent(
      conversationId,
      {
        ...message,
        role: "user",
      },
      { run: true },
    );

    return {
      id: `${conversationId}:${Date.now()}`,
      queued: true,
      position: 1,
    };
  }
}

export default PendingMessageService;
