import { useQuery } from "@tanstack/react-query";
import { FileClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { fileBrowserApi } from "#/api/file-browser/file-browser-api";
import { useActiveBackend } from "#/contexts/active-backend-context";

export interface FileBrowserEntry {
  label: string;
  path: string;
}

export interface HomeDirectoryResponse {
  home: string;
  favorites?: FileBrowserEntry[];
  locations?: FileBrowserEntry[];
}

function getFileClient() {
  return new FileClient(getAgentServerClientOptions());
}

export const useSearchSubdirs = (
  path: string | null,
  includeHidden = false,
) => {
  const active = useActiveBackend();
  return useQuery({
    queryKey: [
      "file",
      "search_subdirs",
      path,
      includeHidden,
      active.backend.id,
      active.orgId,
    ],
    queryFn: () =>
      includeHidden
        ? fileBrowserApi.searchSubdirectoriesWithHidden({
            path: path as string,
          })
        : getFileClient().searchSubdirectories(path as string),
    enabled: !!path,
    retry: false,
    meta: { disableToast: true },
  });
};

export const useHomeDirectory = (includeHidden = false) => {
  const active = useActiveBackend();
  return useQuery({
    queryKey: ["file", "home", includeHidden, active.backend.id, active.orgId],
    queryFn: async (): Promise<HomeDirectoryResponse> =>
      includeHidden
        ? fileBrowserApi.getHomeWithHidden()
        : getFileClient().getHome(),
    retry: false,
    meta: { disableToast: true },
    staleTime: Infinity,
  });
};
