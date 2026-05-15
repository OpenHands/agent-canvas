import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { AutomationRun } from "#/types/automation";
import { RunStatusBadge } from "./run-status-badge";

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

  const content = (
    <>
      <div className="flex items-center gap-3">
        <span className="text-sm text-content">
          {formatRunTimestamp(run.started_at, i18n.language)}
        </span>
        {!hasConversation && (
          <span className="text-xs text-muted italic">
            ({t(I18nKey.AUTOMATIONS$DETAIL$NO_CONVERSATION)})
          </span>
        )}
      </div>
      <RunStatusBadge status={run.status} />
    </>
  );

  if (hasConversation && run.conversation_id) {
    return (
      <a
        href={getConversationUrl(run.conversation_id)}
        className="flex items-center justify-between px-5 py-3 transition-colors cursor-pointer hover:bg-surface-raised focus:bg-surface-raised focus:outline-none"
        aria-label={`View conversation for run at ${formatRunTimestamp(run.started_at, i18n.language)}`}
      >
        {content}
      </a>
    );
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 cursor-default">
      {content}
    </div>
  );
}
