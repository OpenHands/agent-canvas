import { useQuery } from "@tanstack/react-query";
import FilesService from "#/api/files-service/files-service.api";

export const useListSubdirs = (path: string | null) =>
  useQuery({
    queryKey: ["file", "list_subdirs", path],
    queryFn: () => FilesService.listSubdirs(path as string),
    enabled: !!path,
    retry: false,
    meta: { disableToast: true },
  });

export const useHomeDirectory = () =>
  useQuery({
    queryKey: ["file", "home"],
    queryFn: () => FilesService.getHome(),
    retry: false,
    meta: { disableToast: true },
    staleTime: Infinity,
  });
