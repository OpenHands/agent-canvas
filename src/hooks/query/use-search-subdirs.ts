import { useQuery } from "@tanstack/react-query";
import FilesService from "#/api/files-service/files-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";

export const useSearchSubdirs = (path: string | null) => {
  const active = useActiveBackend();
  return useQuery({
    queryKey: ["file", "search_subdirs", path, active.backend.id, active.orgId],
    queryFn: () => FilesService.searchSubdirs(path as string),
    enabled: !!path,
    retry: false,
    meta: { disableToast: true },
  });
};

export const useHomeDirectory = () => {
  const active = useActiveBackend();
  return useQuery({
    queryKey: ["file", "home", active.backend.id, active.orgId],
    queryFn: () => FilesService.getHome(),
    retry: false,
    meta: { disableToast: true },
    staleTime: Infinity,
  });
};
