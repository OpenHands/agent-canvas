import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import TerminalIcon from "#/icons/terminal.svg?react";
import XCircleIcon from "#/icons/x-circle.svg?react";
import { AutomationRunStatus, type AutomationRun } from "#/types/automation";
import { useCancelRun } from "#/hooks/query/use-automations";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { RunStatusBadge } from "./run-status-badge";
import { RunLogsModal } from "./run-logs-modal";
import { CancelRunModal } from "./cancel-run-modal";

interface ActivityLogItemProps {
  run: AutomationRun;
}

function formatRunTimestamp(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isInvalidTimestamp(dateStr: string | null | undefined): boolean {
  if (!dateStr) return true;
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) || t === 0;
}

function getConversationUrl(conversationId: string): string {
  // In agent-canvas, conversations are at /conversations/:id
  return `/conversations/${conversationId}`;
}

export function ActivityLogItem({ run }: ActivityLogItemProps) {
  const { t, i18n } = useTranslation("openhands");
  const cancelRun = useCancelRun();
  const hasConversation = !!run.conversation_id;
  const hasBashCommand = !!run.bash_command_id;
  const isCancellable =
    run.status === AutomationRunStatus.PENDING ||
    run.status === AutomationRunStatus.RUNNING;
  // Only surface "Conversation not created" when the run has reached a
  // terminal status without a conversation — i.e. the conversation truly
  // will not be created (e.g. sandbox provisioning failed). While
  // PENDING/RUNNING the conversation may still be in the process of being
  // created, and the status badge already communicates the in-progress
  // state.
  const isTerminal =
    run.status === AutomationRunStatus.COMPLETED ||
    run.status === AutomationRunStatus.FAILED ||
    run.status === AutomationRunStatus.CANCELLED;
  const showNoConversationLabel = !hasConversation && isTerminal;
  const [logsOpen, setLogsOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  // The backend leaves started_at unset (epoch/zero) while a run is Pending
  // and only populates it once execution begins. Show the user's local time
  // at first render in that window so the row doesn't read "Jan 1, 1970".
  const [fallbackStartedAt] = useState(() => new Date().toISOString());
  const effectiveStartedAt = isInvalidTimestamp(run.started_at)
    ? fallbackStartedAt
    : run.started_at;

  const formattedTimestamp = formatRunTimestamp(
    effectiveStartedAt,
    i18n.language,
  );

  const handleCancelClick = (
    e:
      | React.MouseEvent<HTMLButtonElement>
      | React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setCancelModalOpen(true);
  };

  const handleCancelConfirm = () => {
    cancelRun.mutate(run.id, {
      onSuccess: () => {
        displaySuccessToast(t(I18nKey.AUTOMATIONS$DETAIL$CANCEL_SUCCESS));
        setCancelModalOpen(false);
      },
      onError: () => {
        displayErrorToast(t(I18nKey.AUTOMATIONS$DETAIL$CANCEL_ERROR));
        setCancelModalOpen(false);
      },
    });
  };

  const handleLogsClick = (
    e:
      | React.MouseEvent<HTMLButtonElement>
      | React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    // Stop the click bubbling up to the parent <a> so the user stays on
    // the automation detail page instead of navigating to the conversation.
    e.stopPropagation();
    e.preventDefault();
    setLogsOpen(true);
  };

  const cancelButton = isCancellable ? (
    <button
      type="button"
      onClick={handleCancelClick}
      disabled={cancelRun.isPending}
      className="rounded-md p-1 text-muted hover:bg-surface-raised hover:text-danger focus:bg-surface-raised focus:outline-none disabled:opacity-50"
      aria-label={t(I18nKey.AUTOMATIONS$DETAIL$CANCEL_RUN)}
      title={t(I18nKey.AUTOMATIONS$DETAIL$CANCEL_RUN)}
    >
      <XCircleIcon className="size-4" />
    </button>
  ) : null;

  const logsButton = hasBashCommand ? (
    <button
      type="button"
      onClick={handleLogsClick}
      className="rounded-md p-1 text-muted hover:bg-surface-raised hover:text-foreground focus:bg-surface-raised focus:outline-none"
      aria-label={t(I18nKey.AUTOMATIONS$DETAIL$LOGS_VIEW, {
        timestamp: formattedTimestamp,
      })}
      title={t(I18nKey.AUTOMATIONS$DETAIL$LOGS_VIEW_SHORT)}
    >
      <TerminalIcon className="size-4" />
    </button>
  ) : null;

  const content = (
    <>
      <div className="flex items-center gap-3">
        <span className="text-sm text-content">{formattedTimestamp}</span>
        {showNoConversationLabel && (
          <span className="text-xs text-muted italic">
            ({t(I18nKey.AUTOMATIONS$DETAIL$NO_CONVERSATION)})
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {cancelButton}
        {logsButton}
        <RunStatusBadge status={run.status} />
      </div>
    </>
  );

  return (
    <>
      {hasConversation && run.conversation_id ? (
        <a
          href={getConversationUrl(run.conversation_id)}
          className="flex items-center justify-between px-5 py-3 transition-colors cursor-pointer hover:bg-surface-raised focus:bg-surface-raised focus:outline-none"
          aria-label={`View conversation for run at ${formattedTimestamp}`}
        >
          {content}
        </a>
      ) : (
        <div className="flex items-center justify-between px-5 py-3 cursor-default">
          {content}
        </div>
      )}

      {hasBashCommand && (
        <RunLogsModal
          conversationId={run.conversation_id}
          bashCommandId={run.bash_command_id}
          isOpen={logsOpen}
          onClose={() => setLogsOpen(false)}
        />
      )}

      <CancelRunModal
        isOpen={cancelModalOpen}
        isPending={cancelRun.isPending}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelModalOpen(false)}
      />
    </>
  );
}
