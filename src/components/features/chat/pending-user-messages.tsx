import React from "react";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { useSendMessage } from "#/hooks/use-send-message";
import { createChatMessage } from "#/services/chat-service";
import { ChatMessage } from "./chat-message";

/**
 * Renders the queue of locally-tracked user messages that have been submitted
 * but not yet echoed back through the WebSocket. Each message shows a faded
 * "sending" treatment until the server echoes a real `UserMessageEvent`
 * (which removes it via `consumeOldestSendingMessage`). If the API rejects the
 * send, the message switches to an "error" state with a retry button.
 */
export function PendingUserMessages() {
  const pendingMessages = useOptimisticUserMessageStore(
    (state) => state.pendingMessages,
  );
  const markPendingMessageError = useOptimisticUserMessageStore(
    (state) => state.markPendingMessageError,
  );
  const markPendingMessageSending = useOptimisticUserMessageStore(
    (state) => state.markPendingMessageSending,
  );
  const { send } = useSendMessage();

  const handleRetry = React.useCallback(
    async (id: string) => {
      const message = useOptimisticUserMessageStore
        .getState()
        .pendingMessages.find((entry) => entry.id === id);
      if (!message) return;

      markPendingMessageSending(id);

      try {
        await send(
          createChatMessage(
            message.text,
            message.imageUrls,
            message.fileUrls,
            message.timestamp,
          ),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to send message";
        markPendingMessageError(id, errorMessage);
      }
    },
    [send, markPendingMessageError, markPendingMessageSending],
  );

  if (pendingMessages.length === 0) {
    return null;
  }

  return (
    <>
      {pendingMessages.map((message) => (
        <ChatMessage
          key={message.id}
          type="user"
          message={message.text}
          pendingStatus={message.status}
          onRetry={
            message.status === "error"
              ? () => handleRetry(message.id)
              : undefined
          }
        />
      ))}
    </>
  );
}
