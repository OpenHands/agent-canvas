import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { FileClient } from "@openhands/typescript-client/clients";

import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { useLocalWorkspaces } from "#/hooks/query/use-local-workspaces";
import { LocalWorkspace, LocalWorkspaceParent } from "#/types/workspace";

interface UseResolvedWorkspacesResult {
  workspaces: LocalWorkspace[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Implicit workspace parents that are always considered when resolving
 * workspaces. `/projects` is a well-known directory that some agent-server
 * setups use as the projects root. We surface its immediate subdirectories
 * as workspaces automatically in dev mode.
 *
 * This is a development convenience only. Production previews may point at
 * arbitrary remote agent servers that do not expose the file-browser endpoint;
 * probing `/projects` there creates noisy 404s before the user has added any
 * workspace parent explicitly.
 */
const INCLUDE_IMPLICIT_WORKSPACE_PARENTS = import.meta.env.DEV;

const IMPLICIT_WORKSPACE_PARENTS: LocalWorkspaceParent[] = [
  { id: "implicit:/projects", name: "/projects", path: "/projects" },
];

/**
 * Returns the merged list of workspaces to display:
 *   - workspaces explicitly added by the user (from the persisted store),
 *   - the immediate subdirectories of every saved "workspace parent",
 *     fetched dynamically, and
 *   - the immediate subdirectories of any implicit, built-in parents
 *     (currently just `/projects`).
 *
 * Static workspaces always take precedence over a dynamic child with the
 * same path so that user-selected names/ids are preserved.
 */
export function useResolvedWorkspaces(): UseResolvedWorkspacesResult {
  const {
    data,
    isLoading: isLoadingList,
    isError: isErrorList,
  } = useLocalWorkspaces();
  const workspaces = data?.workspaces ?? [];
  const storedParents = data?.workspaceParents ?? [];

  // Merge stored parents with the implicit ones, deduping on path so a
  // user-added `/projects` doesn't trigger a second query.
  const workspaceParents = useMemo(() => {
    const seen = new Set(storedParents.map((p) => p.path));
    // Filter out implicit parents that conflict with user-added ones (by path)
    // so custom names/ids are preserved.
    const implicitParents = INCLUDE_IMPLICIT_WORKSPACE_PARENTS
      ? IMPLICIT_WORKSPACE_PARENTS
      : [];
    const extras = implicitParents.filter((p) => !seen.has(p.path));
    return extras.length === 0 ? storedParents : [...storedParents, ...extras];
  }, [storedParents]);

  const parentQueries = useQueries({
    queries: workspaceParents.map((parent) => ({
      queryKey: ["file", "search_subdirs", parent.path],
      queryFn: () =>
        new FileClient(getAgentServerClientOptions()).searchSubdirectories(
          parent.path,
        ),
      retry: false,
      meta: { disableToast: true },
    })),
  });

  const isLoading = isLoadingList || parentQueries.some((q) => q.isLoading);
  const isError = isErrorList || parentQueries.some((q) => q.isError);

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
  }, [workspaces, workspaceParents, queriesFingerprint]);

  return { workspaces: merged, isLoading, isError };
}
