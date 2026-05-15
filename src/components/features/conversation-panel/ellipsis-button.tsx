import React from "react";
import ThreeDotsVerticalIcon from "#/icons/three-dots-vertical.svg?react";
import { cn } from "#/utils/utils";

interface EllipsisButtonProps {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /**
   * Optional override classes applied to the button. Use this when a
   * caller needs to customize layout (e.g. translate, flex), not to
   * change the icon size or hover treatment which are intentionally
   * shared across the app.
   */
  className?: string;
  ariaLabel?: string;
  /**
   * Override the default `ellipsis-button` test id. Most callers
   * should leave this unset; provide a custom id only when an
   * existing test suite already targets a specific id (e.g. the
   * `profile-menu-trigger` in LLM profile rows).
   */
  testId?: string;
}

/**
 * Standardized "three vertical dots" overflow trigger.
 *
 * Use this anywhere the chrome needs an inline ellipsis menu trigger
 * (conversation header, conversation cards in the side panel,
 * conversation tabs, settings rows, etc.) so that size, color, and
 * hover treatment stay consistent.
 *
 * The chat input area's overflow button uses its own pill-shaped
 * variant with a custom hover background — do NOT replace that one
 * with this component; it is intentionally different.
 */
export function EllipsisButton({
  onClick,
  className,
  ariaLabel,
  testId = "ellipsis-button",
}: EllipsisButtonProps) {
  return (
    <button
      data-testid={testId}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "p-1 rounded-md cursor-pointer transition-colors",
        "text-[var(--oh-muted)] hover:text-white hover:bg-white/10",
        "flex items-center justify-center",
        className,
      )}
    >
      <ThreeDotsVerticalIcon className="w-4 h-4" />
    </button>
  );
}
