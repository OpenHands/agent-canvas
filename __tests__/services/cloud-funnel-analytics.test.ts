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

  it("emits the ready milestone without conversation content", () => {
    trackCloudConversationReady("task-id", "conversation-id");

    expect(mocks.trackEvent).toHaveBeenNthCalledWith(
      1,
      "cloud_conversation_ready",
      expect.objectContaining({
        task_id: "task-id",
        conversation_id: "conversation-id",
      }),
    );
  });

  it("emits the ready milestone only once across polling consumers", () => {
    trackCloudConversationReady("task-dedupe", "conversation-dedupe");
    trackCloudConversationReady("task-dedupe", "conversation-dedupe");

    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue funnel events without consent", () => {
    mocks.enabled = false;

    trackCloudDeviceAuthorizationStarted("https://app.all-hands.dev");

    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });
});
