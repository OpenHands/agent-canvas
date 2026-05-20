import { useQuery } from "@tanstack/react-query";

import WorkspacesService, {
  WorkspacesListResponse,
} from "#/api/workspaces-service/workspaces-service.api";
import { LOCAL_WORKSPACES_QUERY_KEYS } from "#/hooks/query/query-keys";

export function useLocalWorkspaces() {
  return useQuery<WorkspacesListResponse>({
    queryKey: LOCAL_WORKSPACES_QUERY_KEYS.all,
    queryFn: () => WorkspacesService.listWorkspaces(),
    staleTime: 60_000,
  });
}
