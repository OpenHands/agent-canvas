import React from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { useConversationId } from "#/hooks/use-conversation-id";
import { useCommandStore } from "#/stores/command-store";
import { useConversationStore } from "#/stores/conversation-store";
import { useAgentStore } from "#/stores/agent-store";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  clearLastConversationId,
  setLastConversationId,
} from "#/api/backend-registry/last-conversation-store";
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

  // The conversationId in the URL belongs to whichever backend was
  // active when the route first mounted. If the user switches backends
  // while this route is still mounted, the id is meaningless under the
  // new backend — ignore missing-conversation handling while the
  // BackendSelector's redirect navigates away. Mirrors the same guard in
  // `routes/automation-detail.tsx`.
  const active = useActiveBackend();
  const mountedBackendId = React.useRef(active.backend.id);
  const mountedOrgId = React.useRef(active.orgId);
  const backendChanged =
    mountedBackendId.current !== active.backend.id ||
    mountedOrgId.current !== active.orgId;

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
    // The BackendSelector is in the middle of redirecting us away from
    // this route — don't toast/navigate based on a 404 that's just
    // "this id doesn't exist on the new backend".
    if (backendChanged) return;

    if (!conversation) {
      // Clear the per-backend "last selected" slot so the next switch
      // to this backend doesn't try to revisit a stale id.
      clearLastConversationId(active.backend.id, active.orgId);
      displayErrorToast(t(I18nKey.CONVERSATION$NOT_EXIST_OR_NO_PERMISSION));
      navigate("/conversations");
    }
  }, [
    conversation,
    conversationIsError,
    isFetched,
    isAuthed,
    navigate,
    t,
    backendChanged,
    active.backend.id,
    active.orgId,
  ]);

  // Remember the most recently selected conversation for the current
  // (backend, org) so flipping back to this backend later restores the
  // user to where they left off. Skip while a backend switch is in
  // flight: the id in the URL is from the previous backend and would
  // otherwise overwrite the new backend's memory.
  React.useEffect(() => {
    if (backendChanged) return;
    if (!conversationId) return;
    if (conversationId.startsWith("task-")) return;
    setLastConversationId(active.backend.id, active.orgId, conversationId);
  }, [conversationId, backendChanged, active.backend.id, active.orgId]);

  if (conversationIsError && !backendChanged) {
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
