import { useMutation, useQueryClient } from "@tanstack/react-query";
import { switchCloudOrganization } from "#/api/cloud/organization-service.api";
import type { Backend } from "#/api/backend-registry/types";

interface SwitchVariables {
  orgId: string;
  /**
   * Backend to forward `/switch` to. Required when the active backend
   * hasn't been swapped over yet (e.g. switching from Local → a cloud
   * backend, where we want the SaaS-side `current_org_id` updated
   * BEFORE we flip the GUI's active selection — otherwise queries
   * would refetch with stale `current_org_id`).
   */
  backend?: Backend;
}

/**
 * Switch the current cloud organization on the SaaS.
 *
 * Mirrors OpenHands' `useSwitchOrganization`. The SaaS server tracks
 * the caller's "current org", so subsequent API calls automatically
 * scope to the new org.
 *
 * No explicit per-key invalidations on success: every long-lived
 * cloud-aware query (`useSettings`, `usePaginatedConversations`,
 * `useGitRepositories`, `useAppInstallations`, `useGitUser`,
 * `useCloudCurrentUserId`, …) has the active backend identity + orgId
 * baked into its query key. The caller updates the active selection
 * after this mutation succeeds; that re-keys those queries and React
 * Query refetches them automatically — once, with the correct
 * server-side `current_org_id` already in place.
 *
 * Per-conversation queries (`["user", "conversation"]`) are removed
 * outright since their data is org-scoped and shouldn't survive the
 * transition.
 */
export function useSwitchCloudOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, backend }: SwitchVariables) =>
      switchCloudOrganization(orgId, backend),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["user", "conversation"] });
    },
  });
}
