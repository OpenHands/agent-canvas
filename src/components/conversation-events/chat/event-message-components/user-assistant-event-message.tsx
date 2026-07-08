import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { MessageEvent } from "#/types/agent-server/core";
import { ChatMessage } from "../../../features/chat/chat-message";
import { ImageCarousel } from "../../../features/images/image-carousel";
import { ConversationConfirmationButtons } from "#/components/shared/buttons/conversation-confirmation-buttons";
import { parseMessageFromEvent } from "../event-content-helpers/parse-message-from-event";
import { CriticResultDisplay } from "./critic-result-display";
import { CollapsibleThinking } from "./collapsible-thinking";
import { splitInlineThink } from "../event-thought-helpers";
import RepoForkedIcon from "#/icons/repo-forked.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useForkConversation } from "#/hooks/mutation/use-fork-conversation";
import { useConversationStore } from "#/stores/conversation-store";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

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
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();
  const { conversationId } = useOptionalConversationId();
  const isCloud = useActiveBackend().backend.kind === "cloud";
  const { mutate: forkConversation, isPending: isForking } =
    useForkConversation();
  const setMessageToSend = useConversationStore(
    (state) => state.setMessageToSend,
  );
  // Guards a rapid double-click from firing two forks before `isForking`
  // (async React state) has flipped.
  const forkInFlightRef = React.useRef(false);

  const parsed = parseMessageFromEvent(event);
  // Route an inline <think> block (e.g. from a streamed reply) to the thinking
  // section so reloaded conversations match the live rendering.
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

  // "Branch from here": fork the conversation into a new one. For a user
  // message this is "edit message" — the fork excludes the message (see
  // useForkConversation, which resolves its parent as the branch point) and
  // its text goes into the composer so the edited version replaces it. For an
  // assistant message it's a plain branch (history up to and including it,
  // empty composer). Local agent-server only, and only meaningful once we're
  // inside a conversation.
  const canBranch = !isCloud && !!conversationId;
  const handleBranch = () => {
    if (!conversationId || isForking || forkInFlightRef.current) return;
    forkInFlightRef.current = true;

    // Give the fork a distinct title so it doesn't read identically to its
    // source in the sidebar (a fork copies the source's history). Match the id:
    // `getCurrentConversation()` is a shared singleton that can transiently
    // hold the previously-viewed conversation right after navigation.
    const source = ConversationService.getCurrentConversation();
    const sourceTitle =
      source?.id === conversationId ? source.title : undefined;
    const branchTitle = sourceTitle ? `${sourceTitle} (branch)` : undefined;

    // Edit-message mode: a user message with text to edit. An image-only
    // message parses to "" — branch inclusively instead, so its image isn't
    // dropped (excluding it would leave an empty composer with nothing to
    // restore).
    const isEdit = event.source === "user" && message.length > 0;

    forkConversation(
      {
        sourceConversationId: conversationId,
        eventId: event.id,
        ...(isEdit ? { editText: message } : {}),
        ...(branchTitle ? { title: branchTitle } : {}),
      },
      {
        onSuccess: ({ info, excluded }) => {
          navigate(`/conversations/${info.id}`);
          // Prefill only when the message was actually excluded, else a send
          // would duplicate a message that is still in the branch. Deferred so
          // the new conversation's composer receives it (mirrors
          // useLaunchSkillInChat).
          if (excluded) {
            window.setTimeout(() => setMessageToSend(message), 0);
          }
        },
        onError: (error) =>
          displayErrorToast(error instanceof Error ? error.message : null),
        onSettled: () => {
          forkInFlightRef.current = false;
        },
      },
    );
  };
  const actions = canBranch
    ? [
        {
          icon: <RepoForkedIcon width={15} height={15} aria-hidden />,
          onClick: handleBranch,
          tooltip: t(I18nKey.CHAT_INTERFACE$BRANCH_FROM_HERE),
        },
      ]
    : undefined;

  return (
    <>
      {reasoning && <CollapsibleThinking content={reasoning} />}
      <ChatMessage
        type={event.source}
        message={message}
        isFromPlanningAgent={isFromPlanningAgent}
        actions={actions}
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
