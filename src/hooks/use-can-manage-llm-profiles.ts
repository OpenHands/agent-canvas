import { useQuery } from "@tanstack/react-query";
import { getCloudOrganizationMe } from "#/api/cloud/organization-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";

/**
 * Whether the current user may MUTATE LLM profiles on the active backend —
 * create, edit, rename, delete, duplicate, or activate/switch.
 *
 * - Local agent-server (OSS): always `true`; the user owns their own profiles.
 * - Cloud: profiles are org-scoped. The app-server grants every mutating
 *   profile action (save/delete/rename/activate) only to the `owner` and
 *   `admin` roles via `EDIT_ORG_SETTINGS`; a `member` has `VIEW_ORG_SETTINGS`
 *   and is view-only. We read the caller's role from
 *   `GET /api/organizations/{orgId}/me` — the same call `useCloudCurrentUserId`
 *   makes, reusing its query key so no extra request is issued.
 *
 * Returns `false` while the role is still loading or unknown on cloud, so
 * mutating controls never flash for a member before the role resolves.
 */
export function useCanManageLlmProfiles(): boolean {
  const { backend, orgId } = useActiveBackend();
  const isCloud = backend.kind === "cloud";

  // `backend` is identified by `backend.id`, which is already in the key; we
  // keep the key byte-identical to useCloudCurrentUserId so React Query shares
  // the cached /me result instead of firing a second request.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const { data } = useQuery({
    queryKey: ["cloud-current-user", backend.id, orgId],
    queryFn: () => getCloudOrganizationMe(orgId!, backend),
    enabled: isCloud && !!orgId,
    staleTime: 1000 * 60 * 5,
    retry: false,
    meta: { disableToast: true },
  });

  if (!isCloud) return true;
  return data?.role === "owner" || data?.role === "admin";
}
