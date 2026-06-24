import React from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Folder,
  FolderPlus,
  GitBranch,
  Globe,
} from "lucide-react";

import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useNavigation } from "#/context/navigation-context";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useResolvedWorkspaces } from "#/hooks/query/use-resolved-workspaces";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  dropdownMenuListClassName,
  dropdownMenuRowClassName,
  dropdownMenuRowIconWrapperClassName,
} from "#/utils/dropdown-classes";
import { Divider } from "#/ui/divider";
import { ToggleSwitchVisual } from "#/ui/toggle-switch";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SwitchProfileButton } from "#/components/features/chat/switch-profile-button";
import { OpenWorkspaceDialog } from "#/components/features/home/open-workspace-dialog";
import RepoIcon from "#/icons/repo.svg?react";
import { NEW_CONVERSATION_DROPDOWN_SURFACE } from "./new-conversation-dropdown-styles";

/** The project/repo a composed conversation launches against. */
export interface ComposerSource {
  /** Display name shown in the source chip (repo or folder name). */
  label: string;
  /** Worktree/folder path passed to the agent-server. Absent for quick start. */
  workingDir?: string;
  /** Branch shown beside the source, when known. */
  branch?: string | null;
}

interface ConductorWorkspaceComposerProps {
  anchor: { top: number; left: number };
  width: number;
  onClose: () => void;
}

export function ConductorWorkspaceComposer({
  anchor,
  width,
  onClose,
}: ConductorWorkspaceComposerProps) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const [task, setTask] = React.useState("");
  const [createMore, setCreateMore] = React.useState(false);
  // `null` source = quick start (no working dir).
  const [source, setSource] = React.useState<ComposerSource | null>(null);
  const [sourceMenuOpen, setSourceMenuOpen] = React.useState(false);
  const [dialogSource, setDialogSource] = React.useState<
    "repo" | "workspace" | null
  >(null);

  const { workspaces } = useResolvedWorkspaces();
  const { mutate: createConversation, isPending } = useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  const isCreating = isPending || isCreatingElsewhere;

  const dialogOpen = dialogSource !== null;

  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // While a nested popover (source menu) or the workspace dialog is open, the
  // composer must not close on outside clicks/Escape — those interactions are
  // "inside" the flow even though they render outside `rootRef`.
  React.useEffect(() => {
    if (sourceMenuOpen || dialogOpen) return undefined;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, sourceMenuOpen, dialogOpen]);

  const create = () => {
    if (isCreating) return;
    const query = task.trim() || undefined;
    const workingDir = source?.workingDir;
    createConversation(
      {
        workingDir,
        // A picked workspace launches in an isolated per-task worktree;
        // quick start has no working dir and therefore no worktree.
        workspaceMode: workingDir ? "new_worktree" : undefined,
        query,
      },
      {
        onSuccess: (data) => {
          if (createMore) {
            // Batch-create: keep the popover open and reset only the task so
            // the user can immediately queue another run on the same source.
            setTask("");
            textareaRef.current?.focus();
            return;
          }
          onClose();
          navigate(`/conversations/${data.conversation_id}`);
        },
      },
    );
  };

  const onTextareaKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      create();
    }
  };

  const selectSource = (next: ComposerSource | null) => {
    setSource(next);
    setSourceMenuOpen(false);
  };

  const sourceLabel =
    source?.label ?? t(I18nKey.CONVERSATION_PANEL$QUICK_START);

  return (
    <div
      ref={rootRef}
      data-testid="conductor-workspace-composer"
      className={cn(NEW_CONVERSATION_DROPDOWN_SURFACE, "p-3")}
      style={{ position: "fixed", top: anchor.top, left: anchor.left, width }}
    >
      {/* Source selector ("Create from…") */}
      <div className="relative mb-2">
        <button
          type="button"
          data-testid="conductor-workspace-composer-source"
          aria-haspopup="menu"
          aria-expanded={sourceMenuOpen}
          onClick={() => setSourceMenuOpen((value) => !value)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs",
            "text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface-raised)]",
          )}
        >
          {source ? (
            <Folder size={13} className="shrink-0" aria-hidden />
          ) : (
            <FolderPlus size={13} className="shrink-0" aria-hidden />
          )}
          <span className="truncate font-medium text-foreground">
            {sourceLabel}
          </span>
          {source?.branch ? (
            <span className="flex min-w-0 items-center gap-1">
              <GitBranch size={12} className="shrink-0" aria-hidden />
              <span className="truncate">{source.branch}</span>
            </span>
          ) : null}
          <ChevronDown size={13} className="ml-auto shrink-0" aria-hidden />
        </button>

        {sourceMenuOpen ? (
          <div
            data-testid="conductor-workspace-composer-source-menu"
            className={cn(
              NEW_CONVERSATION_DROPDOWN_SURFACE,
              "absolute left-0 right-0 top-full z-10 mt-1",
            )}
          >
            <ul
              className={cn(
                "max-h-[40vh] overflow-y-auto sm:max-h-[240px]",
                dropdownMenuListClassName,
              )}
            >
              <li>
                <button
                  type="button"
                  data-testid="conductor-source-quick-start"
                  onClick={() => selectSource(null)}
                  className={dropdownMenuRowClassName}
                >
                  <span
                    className={dropdownMenuRowIconWrapperClassName}
                    aria-hidden
                  >
                    <FolderPlus size={16} aria-hidden />
                  </span>
                  <span className="truncate">
                    {t(I18nKey.CONVERSATION_PANEL$QUICK_START)}
                  </span>
                </button>
              </li>
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <button
                    type="button"
                    data-testid="conductor-source-workspace"
                    data-workspace-path={workspace.path}
                    onClick={() =>
                      selectSource({
                        label: workspace.name,
                        workingDir: workspace.path,
                      })
                    }
                    className={dropdownMenuRowClassName}
                  >
                    <span
                      className={dropdownMenuRowIconWrapperClassName}
                      aria-hidden
                    >
                      <RepoIcon width={14} height={14} />
                    </span>
                    <span className="truncate">{workspace.name}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className={cn("flex flex-col", dropdownMenuListClassName)}>
              <Divider inset="menu" />
              <button
                type="button"
                data-testid="conductor-source-open-project"
                onClick={() => {
                  setSourceMenuOpen(false);
                  setDialogSource("workspace");
                }}
                className={dropdownMenuRowClassName}
              >
                <span
                  className={dropdownMenuRowIconWrapperClassName}
                  aria-hidden
                >
                  <Folder size={16} aria-hidden />
                </span>
                <span className="truncate">
                  {t(I18nKey.CONVERSATION_PANEL$OPEN_PROJECT)}
                </span>
              </button>
              <button
                type="button"
                data-testid="conductor-source-open-github-project"
                onClick={() => {
                  setSourceMenuOpen(false);
                  setDialogSource("repo");
                }}
                className={dropdownMenuRowClassName}
              >
                <span
                  className={dropdownMenuRowIconWrapperClassName}
                  aria-hidden
                >
                  <Globe size={16} aria-hidden />
                </span>
                <span className="truncate">
                  {t(I18nKey.CONVERSATION_PANEL$OPEN_GITHUB_PROJECT)}
                </span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <textarea
        ref={textareaRef}
        data-testid="conductor-workspace-composer-input"
        value={task}
        onChange={(event) => setTask(event.target.value)}
        onKeyDown={onTextareaKeyDown}
        rows={3}
        placeholder={t(I18nKey.SUGGESTIONS$WHAT_TO_BUILD)}
        className={cn(
          "w-full resize-none rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)]",
          "px-3 py-2 text-sm text-foreground outline-none",
          "placeholder:text-[var(--oh-text-secondary)] focus:border-[var(--oh-border-subtle)]",
        )}
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SwitchProfileButton />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={createMore}
            aria-label={t(I18nKey.CONVERSATION_PANEL$CREATE_MORE)}
            onClick={() => setCreateMore((value) => !value)}
            className="flex items-center gap-2 text-xs text-[var(--oh-muted)]"
          >
            <ToggleSwitchVisual enabled={createMore} />
            {t(I18nKey.CONVERSATION_PANEL$CREATE_MORE)}
          </button>
          <BrandButton
            type="button"
            variant="primary"
            testId="conductor-workspace-composer-create"
            isDisabled={isCreating}
            onClick={create}
          >
            {t(I18nKey.BUTTON$CREATE)}
          </BrandButton>
        </div>
      </div>

      <OpenWorkspaceDialog
        isOpen={dialogOpen}
        initialSource={dialogSource ?? undefined}
        onClose={() => setDialogSource(null)}
        onConfirm={(workspace) => {
          setDialogSource(null);
          setSource({ label: workspace.name, workingDir: workspace.path });
        }}
      />
    </div>
  );
}
