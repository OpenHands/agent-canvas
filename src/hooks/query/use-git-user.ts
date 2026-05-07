import { useQuery } from "@tanstack/react-query";
import React from "react";
import { usePostHog } from "posthog-js/react";
import UserService from "#/api/user-service/user-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useShouldShowUserFeatures } from "#/hooks/use-should-show-user-features";

export const useGitUser = () => {
  const posthog = usePostHog();
  const shouldFetchUser = useShouldShowUserFeatures();
  const active = useActiveBackend();

  const user = useQuery({
    // Backend identity in the key — different backends have different
    // git users; switching gives each its own cache slot.
    queryKey: ["user", active.backend.id, active.orgId],
    queryFn: UserService.getUser,
    enabled: shouldFetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    // The "no git provider configured" condition is now a `null` data
    // value (see ProviderHandler.getUserGitInfo) rather than an error,
    // but suppressing this query's global error toast is still the
    // right policy: any failure here is a UX-affecting empty-state
    // signal rather than an actionable user error.
    meta: { disableToast: true },
  });

  React.useEffect(() => {
    if (user.data) {
      posthog.identify(user.data.login, {
        company: user.data.company,
        name: user.data.name,
        email: user.data.email,
        user: user.data.login,
      });
    }
  }, [posthog, user.data]);

  return user;
};
