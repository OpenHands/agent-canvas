import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { I18nKey } from "#/i18n/declaration";
import { useWorkspaceFiles } from "#/hooks/query/use-workspace-files";
import { useIsGitRepo } from "#/hooks/use-is-git-repo";
import { useHasGitCommits } from "#/hooks/query/use-has-git-commits";
import { useAutoRefreshFilesOnEdit } from "#/hooks/use-auto-refresh-files-on-edit";
import { useUnifiedGetGitChanges } from "#/hooks/query/use-unified-get-git-changes";
import { sortFilesByPriority } from "#/utils/file-priority";
import { FileQuickRow } from "#/components/features/files-tab/file-quick-row";
import { FileTreeView } from "#/components/features/files-tab/file-tree-view";
import { FileContentViewer } from "#/components/features/files-tab/file-content-viewer";
import { SegmentedToggle } from "#/components/features/files-tab/segmented-toggle";
import type { ViewMode } from "#/components/features/files-tab/view-mode";
import RefreshIcon from "#/icons/u-refresh.svg?react";
import GitChanges from "./changes-tab";

function FilesTab() {
  const { t } = useTranslation("openhands");

  // Keep the list / content / diff caches fresh as the agent writes files.
  useAutoRefreshFilesOnEdit();

  const { isGitRepo } = useIsGitRepo();
  // A repo with zero commits has no diff base to compare against, so the
  // diff view would just be empty / misleading. Only probe when we already
  // believe there's a repo — saves a workspace round trip on every plain
  // (non-git) conversation.
  const { hasCommits } = useHasGitCommits({ enabled: isGitRepo });

  // Diff view defaults to ON inside an existing git repo *with at least
  // one commit*, OFF otherwise (no repo, or repo with no commits yet).
  //
  // We treat `hasCommits === null` (still loading the probe) as
  // optimistically `true`: the common case is a normal repo, so this
  // avoids a brief flash of files-view → diff-view on initial load. Once
  // the probe resolves to `false` we switch to files view. The user's
  // explicit choice (via `diffViewOverride`) always wins.
  const [diffViewOverride, setDiffViewOverride] = useState<boolean | null>(
    null,
  );
  const diffViewDefault = isGitRepo && hasCommits !== false;
  const diffViewEnabled = diffViewOverride ?? diffViewDefault;

  const [contentViewMode, setContentViewMode] = useState<ViewMode>("rich");
  // Collapsed by default — the quick-access pill row at the top is usually
  // enough; the user can expand the tree on demand.
  const [isTreeVisible, setIsTreeVisible] = useState(false);

  const filesQuery = useWorkspaceFiles();
  const paths = useMemo(() => filesQuery.data ?? [], [filesQuery.data]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Auto-select the highest-priority file the first time we load the list,
  // so users see something useful immediately.
  useEffect(() => {
    if (selectedPath || paths.length === 0) return;
    const [first] = sortFilesByPriority(paths);
    if (first) setSelectedPath(first);
  }, [paths, selectedPath]);

  // Refresh button: covers the diff view (git changes) and the file viewer
  // (workspace listing + cached file contents). Lives in this toolbar — not
  // in the outer ConversationTabs bar — so it sits with the other
  // files-tab-local controls.
  const queryClient = useQueryClient();
  const { refetch: refetchGitChanges, isFetching: isFetchingGitChanges } =
    useUnifiedGetGitChanges();
  const refreshFiles = () => {
    refetchGitChanges();
    queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
  };

  return (
    <main
      className="h-full w-full flex flex-col items-stretch"
      data-testid="files-tab"
    >
      {/* Top toolbar: diff/files + rich/plain toggles (left-aligned) plus
          the refresh button on the right. */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#3A3D44]">
        <SegmentedToggle<"on" | "off">
          ariaLabel={t(I18nKey.FILES$DIFF_VIEW)}
          testId="files-tab-diff-toggle"
          value={diffViewEnabled ? "on" : "off"}
          options={[
            { value: "on", label: t(I18nKey.FILES$DIFF_VIEW) },
            { value: "off", label: t(I18nKey.COMMON$FILES) },
          ]}
          onChange={(value) => setDiffViewOverride(value === "on")}
        />

        {!diffViewEnabled && (
          <SegmentedToggle<ViewMode>
            ariaLabel={t(I18nKey.FILES$RICH)}
            testId="files-tab-content-mode-toggle"
            value={contentViewMode}
            options={[
              { value: "rich", label: t(I18nKey.FILES$RICH) },
              { value: "plain", label: t(I18nKey.FILES$PLAIN) },
            ]}
            onChange={setContentViewMode}
          />
        )}

        <button
          type="button"
          onClick={refreshFiles}
          disabled={isFetchingGitChanges}
          aria-label={t(I18nKey.COMMON$FILES)}
          data-testid="files-tab-refresh"
          className="ml-auto flex items-center justify-center w-[26px] py-1 rounded-[7px] hover:enabled:bg-[#474A54] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshIcon
            width={12.75}
            height={15}
            color="#ffffff"
            className={isFetchingGitChanges ? "animate-spin" : ""}
          />
        </button>
      </div>

      {diffViewEnabled ? (
        <div className="flex-1 min-h-0">
          <GitChanges />
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-h-0">
          {filesQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[#9299AA]">
              {t(I18nKey.FILES$LOADING_FILES)}
            </div>
          ) : (
            <>
              <FileQuickRow
                paths={paths}
                selectedPath={selectedPath}
                onSelectFile={setSelectedPath}
                isTreeVisible={isTreeVisible}
                onToggleTree={() => setIsTreeVisible((prev) => !prev)}
              />
              <div className="flex flex-1 min-h-0">
                {isTreeVisible && (
                  <aside
                    className="w-56 shrink-0 border-r border-[#3A3D44] overflow-y-auto custom-scrollbar-always"
                    data-testid="files-tab-tree"
                  >
                    <FileTreeView
                      paths={paths}
                      selectedPath={selectedPath}
                      onSelectFile={setSelectedPath}
                    />
                  </aside>
                )}
                <section
                  className="flex-1 min-w-0 min-h-0"
                  data-testid="files-tab-content"
                >
                  {selectedPath ? (
                    <FileContentViewer
                      path={selectedPath}
                      viewMode={contentViewMode}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-[#9299AA]">
                      {t(I18nKey.FILES$NO_FILE_SELECTED)}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}

export default FilesTab;
