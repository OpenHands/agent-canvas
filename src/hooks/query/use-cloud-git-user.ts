import { useQuery } from "@tanstack/react-query";
import { getCloudGitUser } from "#/api/cloud/user-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";

/**
 * Fetch `GET /api/v1/users/git-info` for the active cloud backend.
 *
 * Mirrors OpenHands' `useGitUser` — returns the calling user's identity
 * across connected git providers. Disabled when the active backend is
 * local (the local agent-server has no equivalent).
 */
export function useCloudGitUser() {
  const active = useActiveBackend();
  const enabled = active.backend.kind === "cloud";

  return useQuery({
    queryKey: ["cloud-git-user", active.backend.id],
    queryFn: () => getCloudGitUser(),
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    retry: false,
    meta: { disableToast: true },
  });
}
