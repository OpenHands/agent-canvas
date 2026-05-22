import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

export const SKILL_CARD_PILL_CLASS =
  "inline-flex shrink-0 items-center rounded-full border border-[var(--oh-border)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] text-tertiary-light";

const PILL_GAP_PX = 6;
const OVERFLOW_PILL_WIDTH_PX = 40;

export interface SkillCardPill {
  id: string;
  node: React.ReactNode;
}

function computeVisiblePillCount(
  widths: number[],
  containerWidth: number,
): number {
  if (widths.length === 0 || containerWidth <= 0) return 0;

  let used = 0;
  for (let i = 0; i < widths.length; i += 1) {
    const width = widths[i]!;
    const gap = i > 0 ? PILL_GAP_PX : 0;
    const remaining = widths.length - i - 1;
    const reserve = remaining > 0 ? OVERFLOW_PILL_WIDTH_PX + PILL_GAP_PX : 0;
    if (used + gap + width + reserve > containerWidth) {
      return Math.max(1, i);
    }
    used += gap + width;
  }
  return widths.length;
}

interface SkillCardPillRowProps {
  pills: SkillCardPill[];
  testId: string;
}

export function SkillCardPillRow({ pills, testId }: SkillCardPillRowProps) {
  const { t } = useTranslation("openhands");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = React.useState(pills.length);

  const recomputeVisibleCount = React.useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const widths = Array.from(measure.children).map(
      (child) => (child as HTMLElement).offsetWidth,
    );
    setVisibleCount(computeVisiblePillCount(widths, container.clientWidth));
  }, []);

  React.useLayoutEffect(() => {
    recomputeVisibleCount();
  }, [pills, recomputeVisibleCount]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => recomputeVisibleCount());
    observer.observe(container);
    return () => observer.disconnect();
  }, [recomputeVisibleCount]);

  if (pills.length === 0) return null;

  const hiddenCount = Math.max(0, pills.length - visibleCount);

  return (
    <div className="min-w-0 overflow-hidden">
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none fixed top-0 -left-[10000px] z-[-1] flex flex-nowrap items-center gap-1.5 opacity-0"
      >
        {pills.map((pill) => (
          <span key={pill.id}>{pill.node}</span>
        ))}
      </div>
      <div
        ref={containerRef}
        data-testid={testId}
        className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-hidden"
      >
        {pills.slice(0, visibleCount).map((pill) => (
          <span key={pill.id}>{pill.node}</span>
        ))}
        {hiddenCount > 0 ? (
          <span
            data-testid={`${testId}-overflow`}
            className={cn(
              SKILL_CARD_PILL_CLASS,
              "font-medium text-tertiary-alt",
            )}
            title={pills
              .slice(visibleCount)
              .map((pill) => pill.id)
              .join(", ")}
          >
            {t(I18nKey.SETTINGS$SKILLS_PILLS_MORE, { count: hiddenCount })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
