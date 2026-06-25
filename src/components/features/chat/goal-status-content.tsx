import { useTranslation } from "react-i18next";
import CheckCircle from "#/icons/check-circle-solid.svg?react";
import XCircle from "#/icons/x-circle-solid.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { GoalStatus } from "#/types/agent-server/core/events/conversation-state-event";
import { GenericEventMessage } from "./generic-event-message";

const STATUS_LABEL_KEY: Record<GoalStatus["status"], I18nKey> = {
  running: I18nKey.GOAL$STATUS_RUNNING,
  complete: I18nKey.GOAL$STATUS_COMPLETE,
  capped: I18nKey.GOAL$STATUS_CAPPED,
  interrupted: I18nKey.GOAL$STATUS_INTERRUPTED,
};

/**
 * Presentational goal-status row: objective, round count, status word, the
 * judge's score, the judge's "missing" note (expandable), and an indicator —
 * spinner while running, green check when complete, muted cross when it ends
 * without completing (capped/interrupted).
 *
 * Used in two places: the live bottom banner (GoalStatusBanner) while a loop is
 * active, and inline in the message timeline for the terminal status, so a
 * finished `/goal` settles into the conversation. Because the inline copy mounts
 * fresh once terminal, `initiallyExpanded={!active}` expands the note there
 * without any re-mount trickery.
 */
export function GoalStatusContent({ status }: { status: GoalStatus }) {
  const { t } = useTranslation("openhands");
  const {
    active,
    objective,
    iteration,
    max_iterations: maxIterations,
    verdict,
  } = status;
  const scorePct = verdict ? Math.round(verdict.score * 100) : null;
  const details = verdict?.missing
    ? t(I18nKey.GOAL$MISSING, { missing: verdict.missing })
    : "";

  return (
    <div data-testid="goal-status-banner" className="flex flex-col w-full">
      <GenericEventMessage
        title={
          <span className="flex items-center gap-2 flex-wrap">
            <span className="opacity-60">{t(I18nKey.GOAL$PREFIX)}</span>
            <span>{objective}</span>
            <span className="opacity-60">
              {t(I18nKey.GOAL$ROUND, { iteration, max: maxIterations })}
            </span>
            <span>{t(STATUS_LABEL_KEY[status.status])}</span>
            {scorePct !== null && (
              <span className="opacity-60">
                {t(I18nKey.GOAL$SCORE, { score: scorePct })}
              </span>
            )}
            {active ? (
              <span
                data-testid="goal-spinner"
                className="inline-block w-3.5 h-3.5 ml-1 rounded-full border-2 border-transparent border-t-[var(--oh-border-input)] animate-spin"
              />
            ) : status.status === "complete" ? (
              <span data-testid="goal-done" className="inline-flex ml-1">
                <CheckCircle className="w-3.5 h-3.5 fill-success" />
              </span>
            ) : (
              <span data-testid="goal-ended" className="inline-flex ml-1">
                <XCircle className="w-3.5 h-3.5 fill-[var(--oh-muted)]" />
              </span>
            )}
          </span>
        }
        details={details}
        initiallyExpanded={!active}
        chevronPosition="before"
      />
    </div>
  );
}
