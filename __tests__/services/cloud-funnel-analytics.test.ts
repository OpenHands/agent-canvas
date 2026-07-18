import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: true,
  trackEvent: vi.fn(),
}));

vi.mock("#/services/telemetry", () => ({
  isTelemetryEnabled: () => mocks.enabled,
  trackEvent: mocks.trackEvent,
}));

import {
  trackCanvasBackendAdded,
  trackCloudConversationReady,
  trackCloudDeviceAuthorizationStarted,
  trackCloudDeviceAuthorizationSucceeded,
} from "#/services/cloud-funnel-analytics";

describe("cloud funnel analytics", () => {
  beforeEach(() => {
    mocks.enabled = true;
    mocks.trackEvent.mockReset();
  });

  it("emits the device authorization milestones with coarse attribution", () => {
    trackCloudDeviceAuthorizationStarted(
      "https://app.all-hands.dev",
      "onboarding",
    );
    trackCloudDeviceAuthorizationSucceeded(
      "https://app.all-hands.dev",
      "onboarding",
    );

    expect(mocks.trackEvent).toHaveBeenNthCalledWith(
      1,
      "cloud_device_authorization_started",
      expect.objectContaining({
        is_openhands_cloud: true,
        is_custom_host: false,
        source: "onboarding",
        client_source: "agent_canvas",
      }),
    );
    expect(mocks.trackEvent).toHaveBeenNthCalledWith(
      2,
      "cloud_device_authorization_succeeded",
      expect.objectContaining({ client_source: "agent_canvas" }),
    );
  });

  it("emits backend and ready milestones without raw host or credentials", () => {
    trackCanvasBackendAdded({
      backendKind: "cloud",
      connectionMethod: "cloud_login",
      host: "https://app.all-hands.dev",
      hasApiKey: true,
      source: "add_backend_modal",
    });
    trackCloudConversationReady("task-id", "conversation-id");

    expect(mocks.trackEvent).toHaveBeenNthCalledWith(
      1,
      "backend_added",
      expect.objectContaining({
        backend_kind: "cloud",
        connection_method: "cloud_login",
        has_api_key: true,
      }),
    );
    expect(mocks.trackEvent.mock.calls[0][1]).not.toHaveProperty("host");
    expect(mocks.trackEvent).toHaveBeenNthCalledWith(
      2,
      "cloud_conversation_ready",
      expect.objectContaining({
        task_id: "task-id",
        conversation_id: "conversation-id",
      }),
    );
  });

  it("does not enqueue funnel events without Canvas consent", () => {
    mocks.enabled = false;

    expect(
      trackCloudDeviceAuthorizationStarted("https://app.all-hands.dev"),
    ).toBe(false);
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });
});
