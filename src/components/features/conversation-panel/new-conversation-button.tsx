import React from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useNavigation } from "#/context/navigation-context";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useWorkspacesStore } from "#/stores/workspaces-store";
import { LocalWorkspace } from "#/types/workspace";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

import { WorkspaceDropdown } from "#/components/features/home/workspace-dropdown/workspace-dropdown";
import { FolderBrowserModal } from "#/components/features/home/workspace-dropdown/folder-browser-modal";
import { ManageWorkspacesModal } from "#/components/features/home/workspace-dropdown/manage-workspaces-modal";
import { BrandButton } from "#/components/features/settings/brand-button";

/**
 * "+ New" trigger that opens an inline popover on top of the conversation
 * list, mirroring the picker on the home screen (workspace dropdown +
 * "manage workspaces" entry, then a Launch button that creates the
 * conversation and routes into it).
 */
export function NewConversationButton() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();

  const [open, setOpen] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const { workspaces, addWorkspaces, removeWorkspace } = useWorkspacesStore();
  const [selected, setSelected] = React.useState<LocalWorkspace | null>(null);
  const [browserOpen, setBrowserOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);

  const {
    mutate: createConversation,
    isPending,
    isSuccess,
  } = useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  const isCreating = isPending || isSuccess || isCreatingElsewhere;

  // Close the popover on outside click. Modal-based children portal out of
  // the popover, so we ignore clicks while a modal is showing.
  React.useEffect(() => {
    if (!open || browserOpen || manageOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, browserOpen, manageOpen]);

  const handleLaunch = () => {
    if (!selected) return;
    createConversation(
      { workingDir: selected.path },
      {
        onSuccess: (data) => {
          setOpen(false);
          navigate(`/conversations/${data.conversation_id}`);
        },
      },
    );
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        data-testid="new-conversation-button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 w-full px-3 py-2 rounded-md",
          "text-sm font-medium text-white bg-[#1f1f1f99] hover:bg-[#2a2a2a]",
          "border border-[#525252] cursor-pointer transition-colors",
        )}
      >
        <Plus width={16} height={16} className="shrink-0" />
        {t(I18nKey.SIDEBAR$NEW_CONVERSATION)}
      </button>

      {open && (
        <div
          data-testid="new-conversation-popover"
          className={cn(
            "absolute z-30 left-0 right-0 top-full mt-2 p-3",
            "bg-[#26282D] border border-[#727987] rounded-lg shadow-xl",
            "flex flex-col gap-3",
          )}
        >
          <WorkspaceDropdown
            workspaces={workspaces}
            value={selected}
            onChange={setSelected}
            onAddClick={() => setBrowserOpen(true)}
            onManageClick={() => setManageOpen(true)}
          />
          <BrandButton
            testId="new-conversation-launch-button"
            variant="primary"
            type="button"
            isDisabled={!selected || isCreating}
            onClick={handleLaunch}
            className="w-full font-semibold"
          >
            {!isCreating && t(I18nKey.HOME$LAUNCH)}
            {isCreating && t(I18nKey.HOME$LOADING)}
          </BrandButton>
        </div>
      )}

      <FolderBrowserModal
        isOpen={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onAdd={(items) => addWorkspaces(items)}
      />

      <ManageWorkspacesModal
        isOpen={manageOpen}
        workspaces={workspaces}
        onClose={() => setManageOpen(false)}
        onRemove={(path) => {
          if (selected?.path === path) setSelected(null);
          removeWorkspace(path);
        }}
      />
    </div>
  );
}
