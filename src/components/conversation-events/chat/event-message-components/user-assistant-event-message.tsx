import React from "react";
import { MessageEvent } from "#/types/agent-server/core";
import { ChatMessage } from "../../../features/chat/chat-message";
import { ImageCarousel } from "../../../features/images/image-carousel";
import { ConversationConfirmationButtons } from "#/components/shared/buttons/conversation-confirmation-buttons";
import { parseMessageFromEvent } from "../event-content-helpers/parse-message-from-event";
import { CriticResultDisplay } from "./critic-result-display";
import { CollapsibleThinking } from "./collapsible-thinking";
import { splitInlineThink } from "../event-thought-helpers";

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
  const parsed = parseMessageFromEvent(event);
  // Agent messages may carry inline <think> reasoning (e.g. when the response
  // was streamed); route it to the collapsible thinking section instead of the
  // bubble so reloaded conversations match the live streamed rendering.
  const { reasoning, message } =
    event.source === "agent"
      ? splitInlineThink(parsed)
      : { reasoning: "", message: parsed };

  const imageUrls: string[] = [];
  if (Array.isArray(event.llm_message.content)) {
    event.llm_message.content.forEach((content) => {
      if (content.type === "image") {
        imageUrls.push(...content.image_urls);
      }
    });
  }

  return (
    <>
      {reasoning && <CollapsibleThinking content={reasoning} />}
      <ChatMessage
        type={event.source}
        message={message}
        isFromPlanningAgent={isFromPlanningAgent}
      >
        {imageUrls.length > 0 && (
          <ImageCarousel size="small" images={imageUrls} />
        )}
        {isLastMessage && <ConversationConfirmationButtons />}
      </ChatMessage>
      {event.source === "agent" && event.critic_result != null && (
        <CriticResultDisplay criticResult={event.critic_result} />
      )}
    </>
  );
}
