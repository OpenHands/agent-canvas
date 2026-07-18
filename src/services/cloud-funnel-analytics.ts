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
const trackedReadyTaskIds = new Set<string>();

function trackCloudFunnelEvent(
  event: string,
  properties: Record<string, unknown>,
): void {
  if (!isTelemetryEnabled()) return;
  void trackEvent(event, { ...properties, ...commonProperties });
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
  // useTaskPolling is consumed by several mounted surfaces. Its component
  // ref prevents repeats within one hook instance, but the analytics boundary
  // must deduplicate across all instances observing the same Cloud task.
  if (trackedReadyTaskIds.has(taskId)) return;
  trackedReadyTaskIds.add(taskId);

  trackCloudFunnelEvent("cloud_conversation_ready", {
    task_id: taskId,
    conversation_id: conversationId,
  });
}
