import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import FilesService from "#/api/files-service/files-service.api";
import { useWorkspacesStore } from "#/stores/workspaces-store";
import { LocalWorkspace, LocalWorkspaceParent } from "#/types/workspace";

interface UseResolvedWorkspacesResult {
  workspaces: LocalWorkspace[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Implicit workspace parents that are always considered when resolving
 * workspaces. The `dev:docker` script mounts the host's PROJECT_PATH at
 * `/projects` inside the agent-server container, so this directory is
 * effectively the user's projects root in the dockerized dev stack. We
 * surface its immediate subdirectories as workspaces automatically.
 *
 * In environments where `/projects` doesn't exist (e.g. dockerless dev),
 * `searchSubdirs` simply errors and contributes no entries -- the implicit
 * parent stays silent rather than user-visible, which is safe.
 * In environments where `/projects` doesn't exist (e.g. dockerless dev),
 * the `searchSubdirs` call will fail and the implicit parent contributes
 * no entries. This is safe and intentional — the implicit parent stays
 * silent rather than user-visible.
const IMPLICIT_WORKSPACE_PARENTS: LocalWorkspaceParent[] = [
  { id: "implicit:/projects", name: "/projects", path: "/projects" },
];

/**
 * Returns the merged list of workspaces to display:
 *   - workspaces explicitly added by the user (from the persisted store),
 *   - the immediate subdirectories of every saved "workspace parent",
 *     fetched dynamically, and
 *   - the immediate subdirectories of any implicit, built-in parents
 *     (currently just `/projects`, the dockerized dev mount point).
 *
 * Static workspaces always take precedence over a dynamic child with the
 * same path so that user-selected names/ids are preserved.
 */
export function useResolvedWorkspaces(): UseResolvedWorkspacesResult {
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const storedParents = useWorkspacesStore((s) => s.workspaceParents);

  // Merge stored parents with the implicit ones, deduping on path so a
  // user-added `/projects` doesn't trigger a second query.
  const workspaceParents = useMemo(() => {
    const seen = new Set(storedParents.map((p) => p.path));
  const workspaceParents = useMemo(() => {
    const seen = new Set(storedParents.map((p) => p.path));
    // Filter out implicit parents that conflict with user-added ones (by path)
    // so custom names/ids are preserved
    const extras = IMPLICIT_WORKSPACE_PARENTS.filter((p) => !seen.has(p.path));
    return extras.length === 0 ? storedParents : [...storedParents, ...extras];
  }, [storedParents]);
    return extras.length === 0 ? storedParents : [...storedParents, ...extras];
  }, [storedParents]);

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
