import React from "react";
import { cn } from "#/utils/utils";
import {
  HOVER_MARQUEE_CROSSFADE_MS,
  readTransformOffsetPx,
  type HoverMarqueePhase,
} from "./hover-marquee-phase";
import "./hover-marquee-label.css";

/** Fixed scroll speed (ms per px) — duration scales linearly with overflow distance. */
export const HOVER_MARQUEE_MS_PER_PX = 12;
export const HOVER_MARQUEE_OVERFLOW_THRESHOLD_PX = 1;
export const HOVER_MARQUEE_FADE_WIDTH = "2.5rem";
export const HOVER_MARQUEE_FADE_IN_DURATION_MS = 150;

export { HOVER_MARQUEE_CROSSFADE_MS } from "./hover-marquee-phase";

export function getHoverMarqueeDurationMs(scrollDistance: number): number {
  if (scrollDistance <= 0) {
    return 0;
  }
  return scrollDistance * HOVER_MARQUEE_MS_PER_PX;
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

export type HoverMarqueeMaskMode = "right" | "both" | "left";

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
 * into view on parent `group` hover (CSS-driven scroll + opacity). Hover-out
 * crossfades back to the truncated start position instead of reversing scroll.
 */
export function HoverMarqueeLabel({
  children,
  className,
  ...rest
}: HoverMarqueeLabelProps) {
  const rootRef = React.useRef<HTMLSpanElement>(null);
  const containerRef = React.useRef<HTMLSpanElement>(null);
  const restRef = React.useRef<HTMLSpanElement>(null);
  const scrollRef = React.useRef<HTMLSpanElement>(null);
  const [scrollDistance, setScrollDistance] = React.useState(0);
  const [phase, setPhase] = React.useState<HoverMarqueePhase>("idle");
  const [exitOffsetPx, setExitOffsetPx] = React.useState(0);

  const measureOverflow = React.useCallback(() => {
    const container = containerRef.current;
    const content = scrollRef.current ?? restRef.current;
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
    const content = scrollRef.current ?? restRef.current;
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

  React.useEffect(() => {
    const root = rootRef.current;
    const group = root?.closest(".group");
    if (!group) {
      return undefined;
    }

    const handleEnter = () => {
      setExitOffsetPx(0);
      setPhase("idle");
    };

    const handleLeave = () => {
      const scroll = scrollRef.current;
      if (!scroll) {
        return;
      }
      setExitOffsetPx(readTransformOffsetPx(scroll));
      setPhase("exiting");
    };

    group.addEventListener("mouseenter", handleEnter);
    group.addEventListener("mouseleave", handleLeave);

    return () => {
      group.removeEventListener("mouseenter", handleEnter);
      group.removeEventListener("mouseleave", handleLeave);
    };
  }, [children]);

  const handleRestTransitionEnd = React.useCallback(
    (event: React.TransitionEvent<HTMLSpanElement>) => {
      if (event.propertyName !== "opacity") {
        return;
      }
      setPhase((current) => {
        if (current === "exiting") {
          setExitOffsetPx(0);
          return "idle";
        }
        return current;
      });
    },
    [],
  );

  const isOverflowing = scrollDistance > HOVER_MARQUEE_OVERFLOW_THRESHOLD_PX;
  const durationMs = getHoverMarqueeDurationMs(scrollDistance);
  const crossfadeMs = HOVER_MARQUEE_CROSSFADE_MS;
  const isExiting = isOverflowing && phase === "exiting";

  return (
    <span
      ref={rootRef}
      className={cn("relative min-w-0", className)}
      data-testid="hover-marquee-label"
      data-overflow={isOverflowing ? "true" : "false"}
      data-phase={isOverflowing ? phase : undefined}
      title={isOverflowing ? children : undefined}
      {...rest}
    >
      <span
        ref={containerRef}
        data-testid="hover-marquee-label-clip"
        data-phase={isOverflowing ? phase : undefined}
        className={cn(
          "relative block min-w-0 overflow-hidden",
          isOverflowing && "hover-marquee-clip",
        )}
        style={
          isOverflowing
            ? ({
                ["--hover-marquee-mask-duration" as string]: `${durationMs}ms`,
                ["--hover-marquee-mask-fade-in-duration" as string]: `${HOVER_MARQUEE_FADE_IN_DURATION_MS}ms`,
                ["--hover-marquee-crossfade-duration" as string]: `${crossfadeMs}ms`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <span
          ref={restRef}
          data-testid="hover-marquee-label-rest"
          className="hover-marquee-rest inline-block whitespace-nowrap"
          onTransitionEnd={handleRestTransitionEnd}
        >
          {children}
        </span>
        {isOverflowing ? (
          <span
            ref={scrollRef}
            data-testid="hover-marquee-label-scroll"
            data-phase={phase}
            aria-hidden
            className="hover-marquee-scroll absolute left-0 top-0 inline-block whitespace-nowrap motion-reduce:transition-none"
            style={{
              ["--hover-marquee-offset" as string]: `${scrollDistance}px`,
              transform: isExiting
                ? `translateX(-${exitOffsetPx}px)`
                : undefined,
            }}
          >
            {children}
          </span>
        ) : null}
      </span>
    </span>
  );
}
