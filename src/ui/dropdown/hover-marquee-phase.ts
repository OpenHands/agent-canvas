export const HOVER_MARQUEE_CROSSFADE_MS = 150;

export type HoverMarqueePhase = "idle" | "exiting";

export function readTransformOffsetPx(element: HTMLElement): number {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") {
    return 0;
  }
  return Math.abs(new DOMMatrixReadOnly(transform).m41);
}
