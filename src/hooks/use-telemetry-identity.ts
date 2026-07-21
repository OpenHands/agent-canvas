import React from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useCloudCurrentUserId } from "#/hooks/query/use-cloud-current-user-id";
import { useSettings } from "#/hooks/query/use-settings";
import { setTelemetryIdentity } from "#/services/telemetry";

/** Keep the telemetry service aligned with the resolved Cloud account. */
export const useTelemetryIdentity = () => {
  const { backend } = useActiveBackend();
  const { data: settings } = useSettings();
  const userIds = useCloudCurrentUserId();
  const identity = backend.kind === "cloud" ? userIds[backend.id] : undefined;
  const isIdentityLoading = identity?.isLoading ?? true;
  const userId = identity?.userId ?? null;
  const email = settings?.email || settings?.git_user_email || undefined;

  React.useEffect(() => {
    // A local backend says nothing about Cloud login state. Preserve the last
    // Cloud identity until a Cloud query explicitly resolves it.
    if (backend.kind !== "cloud" || isIdentityLoading) return;

    if (!userId) {
      void setTelemetryIdentity(null);
      return;
    }

    void setTelemetryIdentity(userId, email ? { email } : {});
  }, [backend.kind, email, isIdentityLoading, userId]);
};
