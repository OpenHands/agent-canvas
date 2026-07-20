import { AGENT_CANVAS_CLIENT_SOURCE } from "#/api/client-source";
import { isOpenHandsCloudHost } from "#/api/device-flow-client";
import { trackEvent } from "#/services/telemetry";

export type CloudConnectionSource =
  | "onboarding"
  | "add_backend_modal"
  | "manage_backends_modal";

const CLOUD_CONVERSATION_READY_INSERT_ID_PREFIX = `${AGENT_CANVAS_CLIENT_SOURCE}:cloud_conversation_ready`;

function trackCloudFunnelEvent(
  event: string,
  properties: Record<string, unknown>,
): void {
  void trackEvent(event, properties);
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
): void {
  trackCloudFunnelEvent("cloud_device_authorization_started", {
    ...hostClassification(host),
    source,
  });
}

export function trackCloudDeviceAuthorizationSucceeded(
  host: string,
  source?: CloudConnectionSource,
): void {
  trackCloudFunnelEvent("cloud_device_authorization_succeeded", {
    ...hostClassification(host),
    source,
  });
}

export function trackCloudConversationReady(
  taskId: string,
  conversationId: string,
): void {
  trackCloudFunnelEvent("cloud_conversation_ready", {
    $insert_id: `${CLOUD_CONVERSATION_READY_INSERT_ID_PREFIX}:${taskId}`,
    task_id: taskId,
    conversation_id: conversationId,
  });
}
