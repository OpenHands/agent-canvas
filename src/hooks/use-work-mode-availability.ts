import React from "react";
import {
  useActiveBackend,
  useActiveBackendContext,
} from "#/contexts/active-backend-context";
import type { WorkModeCapabilityContext } from "#/types/work-mode-capabilities";
import { resolveWorkModeCapabilities } from "#/utils/app-mode-capabilities";

export function useWorkModeCapabilityContext(): WorkModeCapabilityContext {
  const { backend } = useActiveBackend();
  const { backends } = useActiveBackendContext();

  return React.useMemo(() => {
    const hasLocalBackend = backends.some((entry) => entry.kind === "local");
    return {
      backendKind: backend.kind,
      workExecution: backend.workExecution,
      hasLocalBackend,
    };
  }, [backend.kind, backend.workExecution, backends]);
}

export function useWorkModeAvailability() {
  const capabilityContext = useWorkModeCapabilityContext();
  const capabilities = resolveWorkModeCapabilities(capabilityContext);

  return {
    workAllowed: capabilities.allowed,
    workExecution: capabilities.execution,
    hasLocalBackend: capabilityContext.hasLocalBackend === true,
    backendKind: capabilityContext.backendKind,
    capabilityContext,
  };
}
