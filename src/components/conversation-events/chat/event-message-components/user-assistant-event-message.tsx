import React from "react";
import { MessageEvent } from "#/types/agent-server/core";
import { ChatMessage } from "../../../features/chat/chat-message";
import { ImageCarousel } from "../../../features/images/image-carousel";
import { ConversationConfirmationButtons } from "#/components/shared/buttons/conversation-confirmation-buttons";
import { WorkToolRequestBanner } from "#/components/features/work/work-tool-request-banner";
import { stripWorkToolRequests } from "#/types/work-tools";
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
  // Route an inline <think> block (e.g. from a streamed reply) to the thinking
  // section so reloaded conversations match the live rendering.
  const { reasoning, message: rawMessage } =
    event.source === "agent"
      ? splitInlineThink(parsed)
      : { reasoning: "", message: parsed };
  const message =
    event.source === "agent" ? stripWorkToolRequests(rawMessage) : rawMessage;

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
        {event.source === "agent" && isLastMessage ? (
          <WorkToolRequestBanner eventId={event.id} messageText={rawMessage} />
        ) : null}
      </ChatMessage>
      {event.source === "agent" && event.critic_result != null && (
        <CriticResultDisplay criticResult={event.critic_result} />
      )}
    </>
  );
}
