import type { BackendKind } from "#/api/backend-registry/types";
import {
  AGENT_CANVAS_CLIENT_SOURCE,
  AGENT_CANVAS_CLIENT_VERSION,
} from "#/api/client-source";
import { isOpenHandsCloudHost } from "#/api/device-flow-client";
import { isTelemetryEnabled, trackEvent } from "#/services/telemetry";

export type CloudConnectionSource =
  | "onboarding"
  | "add_backend_modal"
  | "manage_backends_modal";

const commonProperties = {
  client_source: AGENT_CANVAS_CLIENT_SOURCE,
  client_version: AGENT_CANVAS_CLIENT_VERSION,
};

function trackCloudFunnelEvent(
  event: string,
  properties: Record<string, unknown>,
): boolean {
  if (!isTelemetryEnabled()) return false;
  void trackEvent(event, { ...properties, ...commonProperties });
  return true;
}

function hostClassification(host: string) {
  const isOpenhandsCloud = isOpenHandsCloudHost(host);
  return {
    is_openhands_cloud: isOpenhandsCloud,
    is_custom_host: !isOpenhandsCloud,
  };
}

export function trackCloudDeviceAuthorizationStarted(
  host: string,
  source?: CloudConnectionSource,
): boolean {
  return trackCloudFunnelEvent("cloud_device_authorization_started", {
    ...hostClassification(host),
    source,
  });
}

export function trackCloudDeviceAuthorizationSucceeded(
  host: string,
  source?: CloudConnectionSource,
): boolean {
  return trackCloudFunnelEvent("cloud_device_authorization_succeeded", {
    ...hostClassification(host),
    source,
  });
}

export function trackCanvasBackendAdded({
  backendKind,
  connectionMethod,
  host,
  hasApiKey,
  source,
}: {
  backendKind: BackendKind;
  connectionMethod: "manual" | "cloud_login";
  host: string;
  hasApiKey: boolean;
  source?: CloudConnectionSource;
}): boolean {
  return trackCloudFunnelEvent("backend_added", {
    backend_kind: backendKind,
    connection_method: connectionMethod,
    ...hostClassification(host),
    has_api_key: hasApiKey,
    source,
  });
}

export function trackCloudConversationReady(
  taskId: string,
  conversationId: string,
): boolean {
  return trackCloudFunnelEvent("cloud_conversation_ready", {
    task_id: taskId,
    conversation_id: conversationId,
  });
}
