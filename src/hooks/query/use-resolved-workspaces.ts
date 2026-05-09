import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import FilesService from "#/api/files-service/files-service.api";
import { useWorkspacesStore } from "#/stores/workspaces-store";
import { LocalWorkspace } from "#/types/workspace";

interface UseResolvedWorkspacesResult {
  workspaces: LocalWorkspace[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Returns the merged list of workspaces to display:
 *   - workspaces explicitly added by the user (from the persisted store), and
 *   - the immediate subdirectories of every saved "workspace parent",
 *     fetched dynamically.
 *
 * Static workspaces always take precedence over a dynamic child with the
 * same path so that user-selected names/ids are preserved.
 */
export function useResolvedWorkspaces(): UseResolvedWorkspacesResult {
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const workspaceParents = useWorkspacesStore((s) => s.workspaceParents);

  const parentQueries = useQueries({
    queries: workspaceParents.map((parent) => ({
      queryKey: ["file", "search_subdirs", parent.path],
      queryFn: () => FilesService.searchSubdirs(parent.path),
      retry: false,
      meta: { disableToast: true },
    })),
  });

  const isLoading = parentQueries.some((q) => q.isLoading);
  const isError = parentQueries.some((q) => q.isError);

  // Stable string fingerprint that changes whenever any parent's subdir
  // results change. Avoids spreading timestamps into the `useMemo` deps,
  // which would change the array length as parents are added/removed.
  const queriesFingerprint = parentQueries
    .map((q) => `${q.dataUpdatedAt ?? 0}:${q.status}`)
    .join("|");

  const merged = useMemo(() => {
    const byPath = new Map<string, LocalWorkspace>();
    const resultsByParent = new Map(
      workspaceParents.map((parent, index) => [
        parent.path,
        parentQueries[index],
      ]),
    );

    workspaceParents.forEach((parent) => {
      const result = resultsByParent.get(parent.path);
      const items = result?.data?.items ?? [];
      items.forEach((entry) => {
        if (byPath.has(entry.path)) return;
        byPath.set(entry.path, {
          id: entry.path,
          name: entry.name,
          path: entry.path,
          parentPath: parent.path,
        });
      });
    });

    // Static workspaces win on duplicate paths.
    workspaces.forEach((w) => {
      byPath.set(w.path, w);
    });

    return Array.from(byPath.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, workspaceParents, queriesFingerprint]);

  return { workspaces: merged, isLoading, isError };
}
