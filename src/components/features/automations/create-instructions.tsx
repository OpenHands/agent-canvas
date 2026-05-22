import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import SparkleIcon from "#/icons/sparkle.svg?react";
import { useNavigation } from "#/context/navigation-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useConversationStore } from "#/stores/conversation-store";
import {
  setConversationState,
  setPendingTaskDraft,
} from "#/utils/conversation-local-storage";

const DOCS_URL =
  "https://docs.openhands.dev/openhands/usage/automations/overview";
const AUTOMATION_PROMPT = "/openhands-automation create";

/**
 * "Create an automation from scratch" card shown when the automations
 * list is empty. Clicking the button starts a new conversation
 * pre-filled with `/openhands-automation create` so the OpenHands
 * automation plugin command runs immediately.
 */
export function CreateInstructions() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const createConversation = useCreateConversation();
  const isCreatingConversation = useIsCreatingConversation();
  const setMessageToSend = useConversationStore(
    (state) => state.setMessageToSend,
  );
  const launchInFlightRef = useRef(false);

  const handleStart = () => {
    if (
      launchInFlightRef.current ||
      createConversation.isPending ||
      isCreatingConversation
    ) {
      return;
    }
    launchInFlightRef.current = true;

    createConversation.mutate(
      {},
      {
        onSuccess: (conversation) => {
          if (
            conversation.conversation_id.startsWith("task-") &&
            conversation.task_id
          ) {
            setPendingTaskDraft(conversation.task_id, AUTOMATION_PROMPT);
          } else {
            setConversationState(conversation.conversation_id, {
              draftMessage: AUTOMATION_PROMPT,
            });
          }
          navigate?.(`/conversations/${conversation.conversation_id}`);
          window.setTimeout(() => setMessageToSend(AUTOMATION_PROMPT), 0);
          // Reset the re-entry guard in case the component stays mounted
          // (e.g. `navigate` is a noop because no NavigationProvider is
          // wired up); otherwise the button would be permanently disabled.
          launchInFlightRef.current = false;
        },
        onError: () => {
          launchInFlightRef.current = false;
        },
      },
    );
  };

  const disabled = createConversation.isPending || isCreatingConversation;

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4">
        <div className="flex items-center gap-2">
          <SparkleIcon className="size-5 text-muted" />
          <span className="text-sm font-medium text-content">
            {t(I18nKey.AUTOMATIONS$CREATE_FROM_SCRATCH_TITLE)}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$CREATE_FROM_SCRATCH_DESC)}
        </p>
        <code className="mt-2 block rounded bg-surface-raised px-3 py-2 font-mono text-xs text-content">
          {AUTOMATION_PROMPT}
        </code>
        <button
          type="button"
          onClick={handleStart}
          disabled={disabled}
          className="mt-3 inline-flex items-center gap-1 rounded-md bg-surface-raised px-3 py-2 text-xs font-medium text-content transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t(I18nKey.AUTOMATIONS$EMPTY_START_CONVERSATION)}
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <p className="mt-4 text-center text-sm text-muted">
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline transition-colors hover:text-foreground"
        >
          {t(I18nKey.AUTOMATIONS$EMPTY_LEARN_MORE)}
        </a>
      </p>
    </div>
  );
}
