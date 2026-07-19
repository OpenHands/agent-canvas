import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

vi.mock("#/services/telemetry", () => ({
  trackEvent: mocks.trackEvent,
}));

import {
  trackCloudConversationReady,
  trackCloudDeviceAuthorizationStarted,
  trackCloudDeviceAuthorizationSucceeded,
} from "#/services/cloud-funnel-analytics";

describe("cloud funnel analytics", () => {
  beforeEach(() => {
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
      }),
    );
    expect(mocks.trackEvent).toHaveBeenNthCalledWith(
      2,
      "cloud_device_authorization_succeeded",
      expect.objectContaining({ source: "onboarding" }),
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

  it("uses a stable insert ID to deduplicate polling consumers at ingestion", () => {
    trackCloudConversationReady("task-dedupe", "conversation-dedupe");
    trackCloudConversationReady("task-dedupe", "conversation-dedupe");

    expect(mocks.trackEvent).toHaveBeenCalledTimes(2);
    expect(mocks.trackEvent).toHaveBeenNthCalledWith(
      2,
      "cloud_conversation_ready",
      expect.objectContaining({
        $insert_id: "agent_canvas:cloud_conversation_ready:task-dedupe",
      }),
    );
  });
});
