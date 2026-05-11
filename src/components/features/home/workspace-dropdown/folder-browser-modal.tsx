import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { LocalWorkspace, LocalWorkspaceParent } from "#/types/workspace";
import {
  useHomeDirectory,
  useSearchSubdirs,
} from "#/hooks/query/use-search-subdirs";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { cn } from "#/utils/utils";
import FolderIcon from "#/icons/folder.svg?react";
import ChevronLeft from "#/icons/chevron-left-small.svg?react";

interface FolderBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (items: LocalWorkspace[]) => void;
  onAddParent?: (items: LocalWorkspaceParent[]) => void;
}

interface SidebarEntry {
  label: string;
  path: string;
}

interface SidebarSectionProps {
  label: string;
  entries: SidebarEntry[];
  currentPath: string | null;
  onPick: (path: string) => void;
}

function SidebarSection({
  label,
  entries,
  currentPath,
  onPick,
}: SidebarSectionProps) {
  if (entries.length === 0) return null;
  return (
    <div className="px-2 pb-3">
      <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-[#A3A3A3] font-semibold">
        {label}
      </div>
      <ul>
        {entries.map((entry) => {
          const isActive = currentPath === entry.path;
          return (
            <li key={entry.path}>
              <button
                type="button"
                onClick={() => onPick(entry.path)}
                data-testid={`folder-browser-sidebar-${entry.label.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1 rounded text-sm cursor-pointer",
                  isActive
                    ? "bg-[#3A3D44] text-white"
                    : "text-[#D6D6D6] hover:bg-[#2F3137]",
                )}
              >
                <FolderIcon width={14} height={14} className="shrink-0" />
                <span className="truncate">{entry.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function getParentPath(path: string): string | null {
  const trimmed = path.replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return null;
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

export function FolderBrowserModal({
  isOpen,
  onClose,
  onAdd,
  onAddParent,
}: FolderBrowserModalProps) {
  const { t } = useTranslation("openhands");
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const active = useActiveBackend();

  const { data: homeData } = useHomeDirectory();

  // Initialize / reset to home each time the modal is opened
  useEffect(() => {
    if (isOpen && homeData?.home && currentPath === null) {
      setCurrentPath(homeData.home);
    }
    if (!isOpen) {
      setCurrentPath(null);
    }
  }, [isOpen, homeData?.home, currentPath]);

  // A backend switch invalidates the previous path — clear it so the
  // open/close effect can re-seed from the new backend's homeData.home.
  useEffect(() => {
    setCurrentPath(null);
  }, [active.backend.id, active.orgId]);

  const {
    data: listing,
    isLoading,
    isError,
    error,
  } = useSearchSubdirs(isOpen ? currentPath : null);

  const favorites: SidebarEntry[] = useMemo(() => {
    if (!homeData?.home) return [];
    const trimmed = homeData.home.replace(/[\\/]+$/, "") || homeData.home;
    return [{ label: "Home", path: trimmed }, ...(homeData.favorites ?? [])];
  }, [homeData]);

  const locations: SidebarEntry[] = homeData?.locations ?? [];

  if (!isOpen) return null;

  const subdirs = listing?.items ?? [];
  const parent = currentPath ? getParentPath(currentPath) : null;

  const getBasename = (path: string): string => {
    const trimmed = path.replace(/\/+$/, "");
    if (!trimmed) return "/";
    const idx = trimmed.lastIndexOf("/");
    return idx >= 0 ? trimmed.slice(idx + 1) || "/" : trimmed;
  };

  const handleAddDirectory = () => {
    if (!currentPath) return;
    const item: LocalWorkspace = {
      id: currentPath,
      name: getBasename(currentPath),
      path: currentPath,
    };
    onAdd([item]);
    onClose();
  };

  const handleAddAllSubdirectories = () => {
    if (!currentPath || !onAddParent) return;
    onAddParent([
      {
        id: currentPath,
        name: getBasename(currentPath),
        path: currentPath,
      },
    ]);
    onClose();
  };

  return (
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.HOME$ADD_WORKSPACES_TITLE)}
    >
      <div
        data-testid="folder-browser-modal"
        className={cn(
          "flex flex-col bg-[#26282D] border border-[#727987] rounded-xl",
          "w-[720px] max-w-[90vw] h-[480px]",
        )}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#727987]">
          <span className="text-sm font-semibold text-white">
            {t(I18nKey.HOME$ADD_WORKSPACES_TITLE)}
          </span>
        </div>

        {/* Body: sidebar + main */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <aside
            data-testid="folder-browser-sidebar"
            className="w-[180px] shrink-0 border-r border-[#727987] bg-[#1F2125] py-3 overflow-y-auto"
          >
            <SidebarSection
              label={t(I18nKey.HOME$FAVORITES)}
              entries={favorites}
              currentPath={currentPath}
              onPick={setCurrentPath}
            />
            <SidebarSection
              label={t(I18nKey.HOME$LOCATIONS)}
              entries={locations}
              currentPath={currentPath}
              onPick={setCurrentPath}
            />
          </aside>

          {/* Main */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Nav row */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#727987]">
              <button
                type="button"
                data-testid="folder-browser-up"
                onClick={() => parent && setCurrentPath(parent)}
                disabled={!parent}
                aria-label="Up"
                className="p-1 rounded hover:bg-[#5C5D62] text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft width={16} height={16} />
              </button>
              <span
                className="text-xs text-[#A3A3A3] truncate"
                data-testid="folder-browser-current-path"
              >
                {currentPath ?? ""}
              </span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_120px] px-4 py-1 border-b border-[#727987] text-xs text-[#B7BDC2] font-semibold">
              <span>{t(I18nKey.HOME$NAME)}</span>
              <span>{t(I18nKey.HOME$KIND)}</span>
            </div>

            {/* List */}
            <ul
              className="flex-1 overflow-auto custom-scrollbar-always"
              data-testid="folder-browser-list"
            >
              {isLoading && (
                <li className="px-4 py-2 text-sm text-[#B7BDC2]">
                  {t(I18nKey.HOME$LOADING)}
                </li>
              )}
              {isError && (
                <li
                  className="px-4 py-2 text-sm text-red-400"
                  data-testid="folder-browser-error"
                >
                  {(error as Error | undefined)?.message ?? "Failed to load"}
                </li>
              )}
              {!isLoading && !isError && subdirs.length === 0 && (
                <li className="px-4 py-2 text-sm text-[#B7BDC2]">
                  {t(I18nKey.HOME$NO_WORKSPACES)}
                </li>
              )}
              {subdirs.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => setCurrentPath(entry.path)}
                    className="grid grid-cols-[1fr_120px] items-center w-full text-left px-4 py-1.5 text-sm text-white hover:bg-[#5C5D62] cursor-pointer"
                    data-testid={`folder-browser-entry-${entry.name}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <FolderIcon width={16} height={16} className="shrink-0" />
                      <span className="truncate">{entry.name}</span>
                    </span>
                    <span className="text-[#B7BDC2] text-xs">
                      {t(I18nKey.HOME$FOLDER)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#727987]">
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onClose}
            testId="folder-browser-cancel"
          >
            {t(I18nKey.HOME$CANCEL)}
          </BrandButton>
          {onAddParent && (
            <BrandButton
              type="button"
              variant="secondary"
              onClick={handleAddAllSubdirectories}
              isDisabled={!currentPath || isLoading}
              testId="folder-browser-add-all-subdirs"
            >
              {t(I18nKey.HOME$ADD_ALL_SUBDIRECTORIES)}
            </BrandButton>
          )}
          <BrandButton
            type="button"
            variant="primary"
            onClick={handleAddDirectory}
            isDisabled={!currentPath || isLoading}
            testId="folder-browser-use"
          >
            {t(I18nKey.HOME$ADD_THIS_DIRECTORY)}
          </BrandButton>
        </div>
      </div>
    </ModalBackdrop>
  );
}
