import React from "react";
import { MessageEvent } from "#/types/agent-server/core";
import { ChatMessage } from "../../../features/chat/chat-message";
import { ImageCarousel } from "../../../features/images/image-carousel";
import { ConversationConfirmationButtons } from "#/components/shared/buttons/conversation-confirmation-buttons";
import { parseMessageFromEvent } from "../event-content-helpers/parse-message-from-event";
import { isOptimisticUserMessageEvent } from "#/utils/optimistic-user-message-events";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { useSendMessage } from "#/hooks/use-send-message";
import { createChatMessage } from "#/services/chat-service";

interface UserAssistantEventMessageProps {
  event: MessageEvent;
  isLastMessage: boolean;
  isFromPlanningAgent: boolean;
}

export function UserAssistantEventMessage({
  event,
  isLastMessage,
  isFromPlanningAgent,
}: UserAssistantEventMessageProps) {
  const markPendingMessageError = useOptimisticUserMessageStore(
    (state) => state.markPendingMessageError,
  );
  const markPendingMessageSending = useOptimisticUserMessageStore(
    (state) => state.markPendingMessageSending,
  );
  const markPendingMessageQueued = useOptimisticUserMessageStore(
    (state) => state.markPendingMessageQueued,
  );
  const { send } = useSendMessage();
  const message = parseMessageFromEvent(event);
  const pendingStatus = isOptimisticUserMessageEvent(event)
    ? event.optimisticPendingStatus
    : undefined;

  const imageUrls: string[] = [];
  if (Array.isArray(event.llm_message.content)) {
    event.llm_message.content.forEach((content) => {
      if (content.type === "image") {
        imageUrls.push(...content.image_urls);
      }
    });
  }

  const handleRetry = React.useCallback(async () => {
    if (!isOptimisticUserMessageEvent(event)) return;

    const pendingMessage = useOptimisticUserMessageStore
      .getState()
      .pendingMessages.find(
        (entry) => entry.id === event.optimisticPendingMessageId,
      );
    if (!pendingMessage) return;

    markPendingMessageSending(pendingMessage.id);

    try {
      await send(
        createChatMessage(
          pendingMessage.content,
          pendingMessage.imageUrls,
          pendingMessage.fileUrls,
          pendingMessage.timestamp,
        ),
      );
      markPendingMessageQueued(pendingMessage.id);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send message";
      markPendingMessageError(pendingMessage.id, errorMessage);
    }
  }, [
    event,
    markPendingMessageError,
    markPendingMessageQueued,
    markPendingMessageSending,
    send,
  ]);

  return (
    <ChatMessage
      type={event.source}
      message={message}
      isFromPlanningAgent={isFromPlanningAgent}
      pendingStatus={pendingStatus}
      onRetry={pendingStatus === "error" ? handleRetry : undefined}
    >
      {imageUrls.length > 0 && (
        <ImageCarousel size="small" images={imageUrls} />
      )}
      {isLastMessage && <ConversationConfirmationButtons />}
    </ChatMessage>
  );
}
