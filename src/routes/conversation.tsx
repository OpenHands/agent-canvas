import React from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { useConversationId } from "#/hooks/use-conversation-id";
import { useCommandStore } from "#/stores/command-store";
import { useConversationStore } from "#/stores/conversation-store";
import { useAgentStore } from "#/stores/agent-store";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { AgentState } from "#/types/agent-state";

import { EventHandler } from "../wrapper/event-handler";

import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useTaskPolling } from "#/hooks/query/use-task-polling";

import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useIsAuthed } from "#/hooks/query/use-is-authed";
import { ConversationMain } from "#/components/features/conversation/conversation-main/conversation-main";

import { WebSocketProviderWrapper } from "#/contexts/websocket-provider-wrapper";
import { useErrorMessageStore } from "#/stores/error-message-store";
import { I18nKey } from "#/i18n/declaration";
import { useEventStore } from "#/stores/use-event-store";

function getConversationLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Unable to load conversation.";
}

function ConversationLoadError({ error }: { error: unknown }) {
  const { t } = useTranslation("openhands");
  const message = getConversationLoadErrorMessage(error);

  return (
    <main
      data-testid="conversation-load-error"
      className="flex min-h-screen w-full items-center justify-center bg-base px-6 text-white"
    >
      <section className="max-w-2xl rounded-2xl border border-danger/40 bg-tertiary p-8 shadow-xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-danger">
          {t(I18nKey.CONVERSATION$LOAD_ERROR_LABEL)}
        </p>
        <h1 className="mb-4 text-2xl font-semibold text-white">
          {t(I18nKey.CONVERSATION$LOAD_ERROR_TITLE)}
        </h1>
        <p className="text-sm leading-6 text-neutral-300">{message}</p>
        <p className="mt-4 text-sm leading-6 text-neutral-400">
          {t(I18nKey.CONVERSATION$LOAD_ERROR_HINT)}
        </p>
      </section>
    </main>
  );
}

function AppContent() {
  const { t } = useTranslation("openhands");
  const { conversationId } = useConversationId();
  const clearEvents = useEventStore((state) => state.clearEvents);

  const { isTask, taskStatus, taskDetail } = useTaskPolling();

  const {
    data: conversation,
    error: conversationError,
    isError: conversationIsError,
    isFetched,
  } = useActiveConversation();
  const { data: isAuthed } = useIsAuthed();
  const { resetConversationState } = useConversationStore();
  const navigate = useNavigate();
  const clearTerminal = useCommandStore((state) => state.clearTerminal);
  const resetConversationRuntimeState = useConversationStateStore(
    (state) => state.reset,
  );
  const setCurrentAgentState = useAgentStore(
    (state) => state.setCurrentAgentState,
  );
  const removeErrorMessage = useErrorMessageStore(
    (state) => state.removeErrorMessage,
  );

  React.useEffect(() => {
    clearTerminal();
    resetConversationState();
    resetConversationRuntimeState();
    setCurrentAgentState(AgentState.LOADING);
    removeErrorMessage();
    clearEvents();
  }, [
    conversationId,
    clearTerminal,
    resetConversationState,
    resetConversationRuntimeState,
    setCurrentAgentState,
    removeErrorMessage,
    clearEvents,
  ]);

  React.useEffect(() => {
    if (isTask && taskStatus === "ERROR") {
      displayErrorToast(
        taskDetail || t(I18nKey.CONVERSATION$FAILED_TO_START_FROM_TASK),
      );
    }
  }, [isTask, taskStatus, taskDetail, t]);

  React.useEffect(() => {
    if (!isFetched || !isAuthed || conversationIsError) return;

    if (!conversation) {
      displayErrorToast(t(I18nKey.CONVERSATION$NOT_EXIST_OR_NO_PERMISSION));
      navigate("/conversations");
    }
  }, [conversation, conversationIsError, isFetched, isAuthed, navigate, t]);

  if (conversationIsError) {
    return <ConversationLoadError error={conversationError} />;
  }

  const content = (
    <EventHandler>
      <div data-testid="app-route" className="flex flex-col h-full">
        <ConversationMain />
      </div>
    </EventHandler>
  );

  return (
    <WebSocketProviderWrapper conversationId={conversationId}>
      {content}
    </WebSocketProviderWrapper>
  );
}

export function ConversationView() {
  return <AppContent />;
}

export default ConversationView;
