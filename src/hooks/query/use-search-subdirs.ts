import { useQuery } from "@tanstack/react-query";
import { FileClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";

export const useSearchSubdirs = (path: string | null) =>
  useQuery({
    queryKey: ["file", "search_subdirs", path],
    queryFn: () =>
      new FileClient(getAgentServerClientOptions()).searchSubdirectories(
        path as string,
      ),
    enabled: !!path,
    retry: false,
    meta: { disableToast: true },
  });

export const useHomeDirectory = () =>
  useQuery({
    queryKey: ["file", "home"],
    queryFn: () => new FileClient(getAgentServerClientOptions()).getHome(),
    retry: false,
    meta: { disableToast: true },
    staleTime: Infinity,
  });
