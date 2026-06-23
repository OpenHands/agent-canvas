import React from "react";
import { cn } from "#/utils/utils";
import "./hover-marquee-label.css";

export const HOVER_MARQUEE_MIN_DURATION_MS = 1200;
export const HOVER_MARQUEE_MAX_DURATION_MS = 4000;
export const HOVER_MARQUEE_MS_PER_PX = 25;
export const HOVER_MARQUEE_OVERFLOW_THRESHOLD_PX = 1;
export const HOVER_MARQUEE_FADE_WIDTH = "2.5rem";
export const HOVER_MARQUEE_FADE_IN_DURATION_MS = 300;

export type HoverMarqueeMaskMode = "right" | "both" | "left";

export function getHoverMarqueeDurationMs(scrollDistance: number): number {
  return Math.min(
    Math.max(
      scrollDistance * HOVER_MARQUEE_MS_PER_PX,
      HOVER_MARQUEE_MIN_DURATION_MS,
    ),
    HOVER_MARQUEE_MAX_DURATION_MS,
  );
}

export function getHoverMarqueeOffset(
  containerWidth: number,
  contentWidth: number,
): number {
  return Math.max(0, contentWidth - containerWidth);
}

/** Maps overflow + hover to visible edge fades (mirrors table scroll logic). */
export function readHoverMarqueeFadeState(options: {
  isOverflowing: boolean;
  isHovered: boolean;
}): { left: boolean; right: boolean } {
  if (!options.isOverflowing) {
    return { left: false, right: false };
  }
  if (!options.isHovered) {
    return { left: false, right: true };
  }
  return { left: true, right: true };
}

export function getHoverMarqueeMaskInsets(
  mode: HoverMarqueeMaskMode,
  fadeWidth: string = HOVER_MARQUEE_FADE_WIDTH,
): { left: string; right: string } {
  switch (mode) {
    case "right":
      return { left: "0px", right: fadeWidth };
    case "left":
      return { left: fadeWidth, right: "0px" };
    case "both":
      return { left: fadeWidth, right: fadeWidth };
    default:
      return { left: "0px", right: "0px" };
  }
}

/** Static mask-image for a given inset pair (used in tests/docs). */
export function getHoverMarqueeMaskImage(
  mode: HoverMarqueeMaskMode,
  fadeWidth: string = HOVER_MARQUEE_FADE_WIDTH,
): string {
  const { left, right } = getHoverMarqueeMaskInsets(mode, fadeWidth);
  return `linear-gradient(to right, transparent 0, black ${left}, black calc(100% - ${right}), transparent 100%)`;
}

interface HoverMarqueeLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: string;
  className?: string;
}

/**
 * Clips long single-line labels to their container and scrolls the overflow
 * into view on parent `group` hover with a smooth in/out transition.
 *
 * Edge fades use an animated CSS mask on the text so the fade stays
 * transparent regardless of row hover/selected backgrounds. Mask insets
 * transition in sync with the marquee (left ~300ms, right matches scroll).
 */
export function HoverMarqueeLabel({
  children,
  className,
  ...rest
}: HoverMarqueeLabelProps) {
  const containerRef = React.useRef<HTMLSpanElement>(null);
  const contentRef = React.useRef<HTMLSpanElement>(null);
  const [scrollDistance, setScrollDistance] = React.useState(0);

  const measureOverflow = React.useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) {
      return;
    }

    setScrollDistance(
      getHoverMarqueeOffset(container.clientWidth, content.scrollWidth),
    );
  }, []);

  React.useLayoutEffect(() => {
    measureOverflow();

    const container = containerRef.current;
    const content = contentRef.current;
    if (!container) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(container);
    if (content) {
      resizeObserver.observe(content);
    }

    return () => resizeObserver.disconnect();
  }, [children, measureOverflow]);

  const isOverflowing = scrollDistance > HOVER_MARQUEE_OVERFLOW_THRESHOLD_PX;
  const durationMs = getHoverMarqueeDurationMs(scrollDistance);

  return (
    <span
      className={cn("relative min-w-0", className)}
      data-testid="hover-marquee-label"
      data-overflow={isOverflowing ? "true" : "false"}
      title={isOverflowing ? children : undefined}
      {...rest}
    >
      <span
        ref={containerRef}
        data-testid="hover-marquee-label-clip"
        className={cn(
          "block min-w-0 overflow-hidden",
          isOverflowing && "hover-marquee-clip",
        )}
        style={
          isOverflowing
            ? ({
                ["--hover-marquee-mask-duration" as string]: `${durationMs}ms`,
                ["--hover-marquee-mask-fade-in-duration" as string]: `${HOVER_MARQUEE_FADE_IN_DURATION_MS}ms`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <span
          ref={contentRef}
          data-testid="hover-marquee-label-content"
          className={cn(
            "inline-block whitespace-nowrap",
            isOverflowing &&
              "transition-transform ease-in-out motion-reduce:transition-none group-hover:[transform:translateX(var(--hover-marquee-offset))]",
          )}
          style={
            isOverflowing
              ? ({
                  ["--hover-marquee-offset" as string]: `-${scrollDistance}px`,
                  transitionDuration: `${durationMs}ms`,
                } as React.CSSProperties)
              : undefined
          }
        >
          {children}
        </span>
      </span>
    </span>
  );
}
