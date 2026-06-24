import { cn } from "#/utils/utils";
import type { ConversationStatusBucketId } from "./conversation-panel-list-helpers";

// Workflow-state colors from the stable status token set. These tokens are
// theme-independent (not overridden in color-themes.ts), the way Linear/
// Conductor keep status hues constant across light/dark. Note: do NOT use
// `--oh-warning` for amber — the themes repurpose it to white/near-black, which
// is what made this glyph render colorless. Applied via `style`/`currentColor`
// because `var()` does not resolve in SVG presentation attributes.
const BUCKET_COLOR: Record<ConversationStatusBucketId, string> = {
  in_progress: "var(--oh-status-warning)",
  in_review: "var(--oh-status-success)",
  done: "var(--oh-status-success)",
};

// Linear/Conductor-style progress glyph: a thin outer ring with a solid pie
// wedge filling it. The wedge is a circle whose stroke-width equals its
// diameter, so the stroke paints a filled disc; `strokeDasharray` then clips
// it to a fraction of the circumference, and the -90° rotation starts the fill
// at 12 o'clock.
const PIE_FRACTION: Partial<Record<ConversationStatusBucketId, number>> = {
  in_progress: 0.5,
  in_review: 0.75,
};

const PIE_RADIUS = 2.25;
const PIE_CIRCUMFERENCE = 2 * Math.PI * PIE_RADIUS;

interface StatusBucketIconProps {
  bucketId: ConversationStatusBucketId;
  className?: string;
}

export function StatusBucketIcon({
  bucketId,
  className,
}: StatusBucketIconProps) {
  const color = BUCKET_COLOR[bucketId];
  const svgClass = cn("h-3.5 w-3.5 shrink-0", className);

  // Drive the glyph color through `currentColor` set via inline `style`: CSS
  // custom properties (`var(--oh-…)`) resolve in `style`/`color` but NOT in
  // SVG presentation attributes like `stroke="var(--oh-…)"`, which silently
  // fall back to near-black. Keeping the color on the element and painting
  // with `currentColor` is the var()-safe path.
  if (bucketId === "done") {
    return (
      <svg
        data-testid={`status-bucket-icon-${bucketId}`}
        viewBox="0 0 14 14"
        className={svgClass}
        style={{ color }}
        aria-hidden
      >
        <circle cx="7" cy="7" r="6" fill="currentColor" />
        <path
          d="M4.3 7.2 6.1 9 9.8 4.9"
          fill="none"
          style={{ stroke: "var(--oh-surface)" }}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const fraction = PIE_FRACTION[bucketId] ?? 0;
  return (
    <svg
      data-testid={`status-bucket-icon-${bucketId}`}
      viewBox="0 0 14 14"
      className={svgClass}
      style={{ color }}
      aria-hidden
    >
      <circle
        cx="7"
        cy="7"
        r="5.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="7"
        cy="7"
        r={PIE_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={PIE_RADIUS * 2}
        strokeDasharray={`${PIE_CIRCUMFERENCE * fraction} ${PIE_CIRCUMFERENCE}`}
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}
