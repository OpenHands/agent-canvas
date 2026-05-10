import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { I18nKey } from "#/i18n/declaration";
import { useWorkspaceFiles } from "#/hooks/query/use-workspace-files";
import { useIsGitRepo } from "#/hooks/use-is-git-repo";
import { useAutoRefreshFilesOnEdit } from "#/hooks/use-auto-refresh-files-on-edit";
import { sortFilesByPriority } from "#/utils/file-priority";
import { FileQuickRow } from "#/components/features/files-tab/file-quick-row";
import { FileTreeView } from "#/components/features/files-tab/file-tree-view";
import { FileContentViewer } from "#/components/features/files-tab/file-content-viewer";
import { SegmentedToggle } from "#/components/features/files-tab/segmented-toggle";
import type { ViewMode } from "#/components/features/files-tab/view-mode";
import GitChanges from "./changes-tab";

function FilesTab() {
  const { t } = useTranslation("openhands");

  // Keep the list / content / diff caches fresh as the agent writes files.
  useAutoRefreshFilesOnEdit();

  const { isGitRepo } = useIsGitRepo();

  // Diff view defaults to ON inside a git repo, OFF otherwise. We don't want
  // to flip the user's choice once they touch the toggle, so track whether
  // they have explicitly overridden the default. While the detection is
  // still loading we keep `diffViewOverride === null`, and the computed
  // `diffViewEnabled` follows `isGitRepo` automatically once it resolves.
  const [diffViewOverride, setDiffViewOverride] = useState<boolean | null>(
    null,
  );
  const diffViewEnabled = diffViewOverride ?? isGitRepo;

  const [contentViewMode, setContentViewMode] = useState<ViewMode>("rich");

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

  return (
    <main
      className="h-full w-full flex flex-col items-stretch"
      data-testid="files-tab"
    >
      {/* Top toolbar: diff toggle + (in non-diff mode) rich/plain toggle. */}
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-[#3A3D44]">
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
              />
              <div className="flex flex-1 min-h-0">
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
