/**
 * rbren branch: fork-local sidebar widget.
 *
 * Renders a small outline-bordered chevron-down button next to the "Code"
 * nav link in the left sidebar. Clicking it opens a popover listing
 * "No workspace" at the top followed by every workspace from
 * `useResolvedWorkspaces`. Selecting any entry immediately starts a new
 * conversation in that workspace (or with no workingDir for "No workspace")
 * and navigates to it.
 *
 * Composition pattern modeled after
 * `components/features/conversation-panel/new-conversation-button-local.tsx`
 * (same `useResolvedWorkspaces` + `useCreateConversation` + `useNavigation`
 * trio, same outside-click / Escape close behavior). This is intentionally
 * separate so the fork-local sidebar tweak can be retired by deleting this
 * file + the wrapping div in `sidebar.tsx`.
 */
import React from "react";
import { ChevronDown } from "lucide-react";

import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useNavigation } from "#/context/navigation-context";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useResolvedWorkspaces } from "#/hooks/query/use-resolved-workspaces";
import { cn } from "#/utils/utils";

interface RbrenWorkspacePickerProps {
  /** Hide the picker entirely when the sidebar is collapsed to a 64px rail. */
  collapsed: boolean;
}

export function RbrenWorkspacePicker({ collapsed }: RbrenWorkspacePickerProps) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const { navigate } = useNavigation();

  const { workspaces, isLoading } = useResolvedWorkspaces();
  const { mutate: createConversation, isPending } = useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  const isCreating = isPending || isCreatingElsewhere;

  // Outside-click closes the popover.
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Escape also closes.
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (collapsed) return null;

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
    "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-sm",
    "text-white hover:bg-[var(--oh-interactive-hover)] transition-colors",
    "disabled:opacity-60 disabled:cursor-not-allowed",
  );

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        data-testid="rbren-workspace-picker-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Pick workspace for new conversation"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md",
          "border border-[var(--oh-border)]",
          "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
          "transition-colors cursor-pointer",
        )}
      >
        <ChevronDown
          width={14}
          height={14}
          className={cn(
            "transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          data-testid="rbren-workspace-picker-popover"
          role="menu"
          className={cn(
            "absolute z-30 top-full right-0 mt-1 p-1 min-w-[220px]",
            "bg-[var(--oh-surface)] border border-[var(--oh-border-input)]",
            "rounded-lg shadow-xl",
            "flex flex-col max-h-[40vh] overflow-y-auto",
          )}
        >
          <button
            type="button"
            role="menuitem"
            disabled={isCreating}
            data-testid="rbren-launch-no-workspace"
            onClick={() => launch()}
            className={itemClass}
          >
            <span className="italic text-[var(--oh-muted)]">No workspace</span>
          </button>

          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitem"
              disabled={isCreating}
              data-testid="rbren-launch-workspace"
              data-workspace-path={w.path}
              title={w.path}
              onClick={() => launch(w.path)}
              className={itemClass}
            >
              <span className="truncate">{w.name}</span>
            </button>
          ))}

          {!isLoading && workspaces.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-[var(--oh-muted)]">
              No workspaces configured
            </div>
          )}
        </div>
      )}
    </div>
  );
}
