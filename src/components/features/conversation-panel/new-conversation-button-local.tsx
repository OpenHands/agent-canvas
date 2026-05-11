import React from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useNavigation } from "#/context/navigation-context";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useWorkspacesStore } from "#/stores/workspaces-store";
import { useResolvedWorkspaces } from "#/hooks/query/use-resolved-workspaces";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import RepoIcon from "#/icons/repo.svg?react";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";

import { FolderBrowserModal } from "#/components/features/home/workspace-dropdown/folder-browser-modal";
import { ManageWorkspacesModal } from "#/components/features/home/workspace-dropdown/manage-workspaces-modal";

interface LocalNewConversationButtonProps {
  /**
   * Render the trigger as a "+" icon-only button (used by the collapsed
   * sidebar). The popover content is unchanged; only the trigger pill
   * collapses.
   */
  compact?: boolean;
}

/**
 * Local-backend variant of the sidebar "+ New Conversation" trigger.
 *
 * Opens an inline popover on top of the conversation list. The popover is a
 * flat list: each entry (including a leading "No workspace" option)
 * immediately starts a conversation when clicked. The sticky footer still
 * exposes "+ Add Workspace" / "Manage Workspaces" entries.
 */
export function LocalNewConversationButton({
  compact = false,
}: LocalNewConversationButtonProps = {}) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();

  const [open, setOpen] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const {
    workspaceParents,
    addWorkspaces,
    removeWorkspace,
    addWorkspaceParents,
    removeWorkspaceParent,
  } = useWorkspacesStore();
  const { workspaces } = useResolvedWorkspaces();
  const [browserOpen, setBrowserOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);

  const { mutate: createConversation, isPending } = useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  // `isCreatingElsewhere` already covers in-flight mutations and the
  // post-submit navigation window (`isNavigating`). We deliberately do not
  // include `isSuccess` here: this component stays mounted across navigation,
  // so a sticky `isSuccess` would lock the button as disabled forever.
  const isCreating = isPending || isCreatingElsewhere;

  // Close the popover on outside click. Modal-based children portal out of
  // the popover, so we ignore clicks while a modal is showing.
  React.useEffect(() => {
    if (!open || browserOpen || manageOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, browserOpen, manageOpen]);

  React.useEffect(() => {
    if (!open || browserOpen || manageOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, browserOpen, manageOpen]);

  const launch = (workingDir?: string) => {
    if (isCreating) return;
    createConversation(
      { workingDir },
      {
        onSuccess: (data) => {
          setOpen(false);
          navigate(`/conversations/${data.conversation_id}`);
        },
      },
    );
  };

  const itemClass = cn(
    "flex items-center gap-2 w-full px-2 py-2 text-sm text-white text-left",
    "hover:bg-[#5C5D62] rounded-md transition-colors duration-150 font-normal",
    "disabled:opacity-60 disabled:cursor-not-allowed",
  );

  const keepPopoverOpenOnMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  const newConversationLabel = t(I18nKey.SIDEBAR$NEW_CONVERSATION);

  const triggerButton = (
    <button
      type="button"
      data-testid="new-conversation-button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-label={compact ? newConversationLabel : undefined}
      className={cn(
        "flex items-center rounded-md cursor-pointer transition-colors",
        "text-sm font-medium text-white bg-[#1f1f1f99] hover:bg-[#2a2a2a]",
        "border border-[#525252]",
        compact
          ? "justify-center w-10 h-10 p-0 mx-auto"
          : "gap-1.5 w-full px-3 py-2",
      )}
    >
      <Plus width={16} height={16} className="shrink-0" />
      {!compact && newConversationLabel}
    </button>
  );

  return (
    <div
      className={cn("relative", compact && "flex justify-center")}
      ref={popoverRef}
    >
      {compact ? (
        <StyledTooltip content={newConversationLabel} placement="right">
          {triggerButton}
        </StyledTooltip>
      ) : (
        triggerButton
      )}

      {open && (
        <div
          data-testid="new-conversation-popover"
          className={cn(
            "absolute z-30 top-full mt-2 p-1",
            "bg-[#26282D] border border-[#727987] rounded-lg shadow-xl",
            "flex flex-col",
            compact ? "left-0 w-[260px]" : "left-0 right-0",
          )}
        >
          <ul className="flex flex-col max-h-[40vh] sm:max-h-[280px] overflow-y-auto">
            <li>
              <button
                type="button"
                disabled={isCreating}
                data-testid="launch-no-workspace"
                onClick={() => launch()}
                className={itemClass}
              >
                <span className="italic text-[#A3A3A3]">
                  {t(I18nKey.HOME$NO_WORKSPACE_OPTION)}
                </span>
              </button>
            </li>
            {workspaces.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  disabled={isCreating}
                  data-testid="launch-workspace"
                  data-workspace-path={w.path}
                  onClick={() => launch(w.path)}
                  className={itemClass}
                >
                  <RepoIcon width={14} height={14} className="shrink-0" />
                  <span className="truncate">{w.name}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col border-t border-[#525252] mt-1 pt-1">
            <button
              type="button"
              data-testid="add-workspaces-button"
              onMouseDown={keepPopoverOpenOnMouseDown}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setBrowserOpen(true);
              }}
              className={itemClass}
            >
              {t(I18nKey.HOME$ADD_WORKSPACES)}
            </button>
            {(workspaces.length > 0 || workspaceParents.length > 0) && (
              <button
                type="button"
                data-testid="manage-workspaces-button"
                onMouseDown={keepPopoverOpenOnMouseDown}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setManageOpen(true);
                }}
                className={itemClass}
              >
                {t(I18nKey.HOME$MANAGE_WORKSPACES)}
              </button>
            )}
          </div>
        </div>
      )}

      <FolderBrowserModal
        isOpen={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onAdd={(items) => addWorkspaces(items)}
        onAddParent={(items) => addWorkspaceParents(items)}
      />

      <ManageWorkspacesModal
        isOpen={manageOpen}
        workspaces={workspaces}
        workspaceParents={workspaceParents}
        onClose={() => setManageOpen(false)}
        onRemove={(path) => removeWorkspace(path)}
        onRemoveParent={(path) => removeWorkspaceParent(path)}
      />
    </div>
  );
}
