import React from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { usePopoverFixedPlacement } from "#/hooks/use-popover-fixed-placement";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { ConductorWorkspaceComposer } from "./conductor-workspace-composer";

const triggerClassName = cn(
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
  "text-[var(--oh-muted)] transition-colors",
  "hover:bg-[var(--oh-surface-raised)] hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oh-border)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

const COMPOSER_WIDTH = 360;

/**
 * Conductor-style "+ New workspace" control for the conversation panel header.
 * Clicking the button opens the composer popover directly; the source
 * (local project, GitHub repo, or quick start) is chosen inside the composer
 * via its "Create from…" selector, then the first task is typed and launched.
 */
export function ConductorNewWorkspaceMenu() {
  const { t } = useTranslation("openhands");

  const [open, setOpen] = React.useState(false);
  const triggerWrapRef = React.useRef<HTMLSpanElement>(null);

  const fixedBox = usePopoverFixedPlacement(triggerWrapRef, {
    open,
    enabled: true,
    targetWidth: COMPOSER_WIDTH,
  });

  const isCreating = useIsCreatingConversation();
  const newWorkspaceLabel = t(I18nKey.CONVERSATION_PANEL$NEW_WORKSPACE);

  return (
    <div>
      <span ref={triggerWrapRef} className="inline-flex">
        <StyledTooltip content={newWorkspaceLabel} placement="bottom">
          <button
            type="button"
            data-testid="conductor-new-workspace-button"
            aria-label={newWorkspaceLabel}
            aria-expanded={open}
            aria-haspopup="dialog"
            disabled={isCreating}
            onClick={() => setOpen((value) => !value)}
            className={triggerClassName}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
          </button>
        </StyledTooltip>
      </span>

      {open && fixedBox !== null ? (
        <ConductorWorkspaceComposer
          width={COMPOSER_WIDTH}
          anchor={{ top: fixedBox.top, left: fixedBox.left }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
