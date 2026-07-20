import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

/** Context fill percentage above which the meter warns and the compact CTA becomes prominent. */
export const CONTEXT_FILL_WARNING_PERCENT = 70;
/** Context fill percentage above which the meter signals danger. */
export const CONTEXT_FILL_DANGER_PERCENT = 90;

interface ContextMeterProps {
  /** Tokens currently held in the agent's context (`per_turn_token`). */
  perTurnToken: number;
  /** Model context window size in tokens. */
  contextWindow: number;
}

export function getContextFillPercent(
  perTurnToken: number,
  contextWindow: number,
): number {
  return contextWindow > 0 ? (perTurnToken / contextWindow) * 100 : 0;
}

/**
 * Context-fill progress bar: neutral below
 * {@link CONTEXT_FILL_WARNING_PERCENT}, amber above it, red above
 * {@link CONTEXT_FILL_DANGER_PERCENT}. Mirrors the layout of the metrics
 * modal's ContextWindowSection with the raw token numbers underneath.
 */
export function ContextMeter({
  perTurnToken,
  contextWindow,
}: ContextMeterProps) {
  const { t } = useTranslation("openhands");

  const usagePercentage = getContextFillPercent(perTurnToken, contextWindow);
  const progressWidth = Math.min(100, usagePercentage);
  const isWarning = usagePercentage > CONTEXT_FILL_WARNING_PERCENT;
  const isDanger = usagePercentage > CONTEXT_FILL_DANGER_PERCENT;

  return (
    <div data-testid="context-meter" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold">
          {t(I18nKey.CONVERSATION$CONTEXT_WINDOW)}
        </span>
        <span
          className={cn(
            "text-xs",
            isDanger
              ? "text-red-500"
              : isWarning
                ? "text-amber-500"
                : "text-[var(--oh-muted)]",
          )}
        >
          {usagePercentage.toFixed(1)}% {t(I18nKey.CONVERSATION$USED)}
        </span>
      </div>
      <div className="w-full h-1.5 bg-tertiary rounded-full overflow-hidden">
        <div
          data-testid="context-meter-bar"
          className={cn(
            "h-full transition-all duration-300",
            isDanger
              ? "bg-red-500"
              : isWarning
                ? "bg-amber-500"
                : "bg-foreground",
          )}
          // runtime usage-percentage width
          style={{ width: `${progressWidth}%` }}
        />
      </div>
      <div className="flex justify-end">
        <span className="text-xs text-[var(--oh-muted)]">
          {perTurnToken.toLocaleString()} / {contextWindow.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
