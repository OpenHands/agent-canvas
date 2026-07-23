import { useEffect } from "react";
import AutomationService from "#/api/automation-service/automation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  getTelemetryConsent,
  subscribeTelemetryConsent,
} from "#/services/telemetry";

export function useSyncAutomationTelemetryConsent() {
  const { backend } = useActiveBackend();

  useEffect(() => {
    if (backend.kind !== "local") return undefined;

    const syncConsent = () => {
      void AutomationService.syncTelemetryConsent(getTelemetryConsent()).catch(
        () => {},
      );
    };

    syncConsent();
    return subscribeTelemetryConsent(syncConsent);
  }, [backend.id, backend.kind]);
}
