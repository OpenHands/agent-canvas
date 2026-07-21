import type { BackendKind } from "#/api/backend-registry/types";

export const UNKNOWN_TELEMETRY_VERSION = "unknown";

export type BackendConnectionMethod = "manual" | "cloud_login";

export interface BackendTelemetryContextInput {
  backendKind?: BackendKind | null;
  agentServerVersion?: string | null;
  automationSdkVersion?: string | null;
  backendVersion?: string | null;
  connectionMethod?: BackendConnectionMethod;
}

function normalizeTelemetryVersion(version: string | null | undefined): string {
  const trimmed = version?.trim();
  return trimmed || UNKNOWN_TELEMETRY_VERSION;
}

export function getBackendTelemetryProperties({
  backendKind,
  agentServerVersion,
  automationSdkVersion,
  backendVersion,
  connectionMethod,
}: BackendTelemetryContextInput): Record<string, unknown> {
  const resolvedAgentServerVersion = normalizeTelemetryVersion(
    agentServerVersion ?? backendVersion,
  );
  const resolvedAutomationSdkVersion =
    normalizeTelemetryVersion(automationSdkVersion);
  const resolvedBackendVersion = normalizeTelemetryVersion(
    backendVersion ?? agentServerVersion,
  );

  return {
    backend_kind: backendKind ?? null,
    agent_server_version: resolvedAgentServerVersion,
    automation_sdk_version: resolvedAutomationSdkVersion,
    backend_version: resolvedBackendVersion,
    ...(connectionMethod ? { connection_method: connectionMethod } : {}),
  };
}
