import { useTranslation } from "react-i18next";

import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { LocalWorkspace, LocalWorkspaceParent } from "#/types/workspace";
import { cn } from "#/utils/utils";
import FolderIcon from "#/icons/folder.svg?react";
import CloseIcon from "#/icons/close.svg?react";

interface ManageWorkspacesModalProps {
  isOpen: boolean;
  workspaces: LocalWorkspace[];
  workspaceParents?: LocalWorkspaceParent[];
  onClose: () => void;
  onRemove: (path: string) => void;
  onRemoveParent?: (path: string) => void;
}

export function ManageWorkspacesModal({
  isOpen,
  workspaces,
  workspaceParents = [],
  onClose,
  onRemove,
  onRemoveParent,
}: ManageWorkspacesModalProps) {
  const { t } = useTranslation("openhands");

  if (!isOpen) return null;

  // Workspaces from a parent are read-only here; users remove the parent.
  const staticWorkspaces = workspaces.filter((w) => !w.parentPath);
  const dynamicWorkspacesByParent = new Map<string, LocalWorkspace[]>();
  workspaces.forEach((w) => {
    if (!w.parentPath) return;
    const list = dynamicWorkspacesByParent.get(w.parentPath) ?? [];
    list.push(w);
    dynamicWorkspacesByParent.set(w.parentPath, list);
  });

  const hasContent = staticWorkspaces.length > 0 || workspaceParents.length > 0;

  return (
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.HOME$MANAGE_WORKSPACES)}
    >
      <div
        data-testid="manage-workspaces-modal"
        className={cn(
          "flex flex-col bg-[#26282D] border border-[#727987] rounded-xl",
          "w-[560px] max-w-[90vw] max-h-[70vh]",
        )}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#727987]">
          <span className="text-sm font-semibold text-white">
            {t(I18nKey.HOME$MANAGE_WORKSPACES)}
          </span>
        </div>

        <div
          className="flex-1 overflow-auto custom-scrollbar-always"
          data-testid="manage-workspaces-list"
        >
          {!hasContent && (
            <p className="px-5 py-6 text-sm text-[#B7BDC2] text-center">
              {t(I18nKey.HOME$MANAGE_WORKSPACES_EMPTY)}
            </p>
          )}

          {staticWorkspaces.length > 0 && (
            <ul>
              {staticWorkspaces.map((workspace) => (
                <li
                  key={workspace.id}
                  className="flex items-center gap-3 px-5 py-2 border-b border-[#363840] last:border-b-0"
                  data-testid={`manage-workspaces-row-${workspace.name}`}
                >
                  <FolderIcon width={16} height={16} className="shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm text-white truncate">
                      {workspace.name}
                    </span>
                    <span className="text-xs text-[#A3A3A3] truncate">
                      {workspace.path}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(workspace.path)}
                    aria-label={t(I18nKey.HOME$REMOVE_WORKSPACE)}
                    data-testid={`manage-workspaces-remove-${workspace.name}`}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[#D6D6D6] hover:bg-[#5C5D62] hover:text-white cursor-pointer"
                  >
                    <CloseIcon width={12} height={12} />
                    <span>{t(I18nKey.HOME$REMOVE_WORKSPACE)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {workspaceParents.length > 0 && (
            <div data-testid="manage-workspaces-parents-section">
              <div className="px-5 pt-3 pb-1 text-[11px] uppercase tracking-wide text-[#A3A3A3] font-semibold">
                {t(I18nKey.HOME$WORKSPACE_PARENTS)}
              </div>
              <ul>
                {workspaceParents.map((parent) => {
                  const children =
                    dynamicWorkspacesByParent.get(parent.path) ?? [];
                  return (
                    <li
                      key={parent.id}
                      className="border-b border-[#363840] last:border-b-0"
                      data-testid={`manage-workspaces-parent-row-${parent.name}`}
                    >
                      <div className="flex items-center gap-3 px-5 py-2">
                        <FolderIcon
                          width={16}
                          height={16}
                          className="shrink-0"
                        />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm text-white truncate">
                            {parent.name}
                          </span>
                          <span className="text-xs text-[#A3A3A3] truncate">
                            {parent.path}
                          </span>
                        </div>
                        {onRemoveParent && (
                          <button
                            type="button"
                            onClick={() => onRemoveParent(parent.path)}
                            aria-label={t(I18nKey.HOME$REMOVE_WORKSPACE_PARENT)}
                            data-testid={`manage-workspaces-remove-parent-${parent.name}`}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[#D6D6D6] hover:bg-[#5C5D62] hover:text-white cursor-pointer"
                          >
                            <CloseIcon width={12} height={12} />
                            <span>
                              {t(I18nKey.HOME$REMOVE_WORKSPACE_PARENT)}
                            </span>
                          </button>
                        )}
                      </div>
                      {children.length > 0 && (
                        <ul className="pb-2">
                          {children.map((child) => (
                            <li
                              key={child.id}
                              className="flex items-center gap-3 px-5 pl-10 py-1 text-xs text-[#B7BDC2]"
                              data-testid={`manage-workspaces-child-${child.name}`}
                            >
                              <FolderIcon
                                width={12}
                                height={12}
                                className="shrink-0 opacity-70"
                              />
                              <span className="truncate">{child.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#727987]">
          <BrandButton
            type="button"
            variant="primary"
            onClick={onClose}
            testId="manage-workspaces-done"
          >
            {t(I18nKey.HOME$DONE)}
          </BrandButton>
        </div>
      </div>
    </ModalBackdrop>
  );
}
