import { cn } from "#/utils/utils";
import type { ConversationDiffStat } from "#/hooks/query/use-conversation-diff-stat";

/** Compact line-count formatter: 30 → "30", 3700 → "3.7k", 12000 → "12k". */
export function formatDiffCount(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  const rounded =
    thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
  return `${rounded}k`;
}

interface ConversationDiffStatChipProps {
  stat: ConversationDiffStat;
  className?: string;
}

export function ConversationDiffStatChip({
  stat,
  className,
}: ConversationDiffStatChipProps) {
  const { additions, deletions } = stat;
  if (additions <= 0 && deletions <= 0) {
    return null;
  }
  return (
    <span
      data-testid="conversation-diff-stat"
      className={cn(
        "flex shrink-0 items-center gap-1 font-mono text-[11px] leading-none tabular-nums",
        className,
      )}
    >
      {additions > 0 ? (
        <span className="text-[var(--oh-status-success)]">
          +{formatDiffCount(additions)}
        </span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-[var(--oh-status-error)]">
          -{formatDiffCount(deletions)}
        </span>
      ) : null}
    </span>
  );
}
