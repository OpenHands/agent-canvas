import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import TerminalIcon from "#/icons/terminal.svg?react";
import type { AutomationRun } from "#/types/automation";
import { RunStatusBadge } from "./run-status-badge";
import { RunLogsModal } from "./run-logs-modal";

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

function getConversationUrl(conversationId: string): string {
  // In agent-canvas, conversations are at /conversations/:id
  return `/conversations/${conversationId}`;
}

export function ActivityLogItem({ run }: ActivityLogItemProps) {
  const { t, i18n } = useTranslation("openhands");
  const hasConversation = !!run.conversation_id;
  const hasBashCommand = !!run.bash_command_id;
  const [logsOpen, setLogsOpen] = useState(false);

  const formattedTimestamp = formatRunTimestamp(run.started_at, i18n.language);

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
        {!hasConversation && (
          <span className="text-xs text-muted italic">
            ({t(I18nKey.AUTOMATIONS$DETAIL$NO_CONVERSATION)})
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
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
    </>
  );
}
