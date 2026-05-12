import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import EventService from "#/api/event-service/event-service.api";
import { callCloudProxy } from "#/api/cloud/proxy";
import type { Backend } from "#/api/backend-registry/types";

vi.mock("#/api/cloud/proxy", () => ({
  callCloudProxy: vi.fn(),
}));

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "cloud-key",
  kind: "cloud",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id, orgId: "org-1" });
  vi.mocked(callCloudProxy).mockReset();
  vi.mocked(callCloudProxy).mockResolvedValue({ items: [], next_page_id: null });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(callCloudProxy).mockReset();
});

describe("EventService.searchEvents — cloud branch", () => {
  it("strips timestamp/sort/page params and clamps limit to <=100", async () => {
    // Arrange: the caller (e.g. `useLoadOlderEvents`) may pass pagination
    // filters the OpenHands SaaS App API can't handle without 500-ing.
    // The cloud branch must mirror the cloud frontend's shape: limit only.
    const options = {
      limit: 500,
      sortOrder: "TIMESTAMP_DESC" as const,
      pageId: "p1",
      timestampGte: "2026-05-01T00:00:00.000000",
      timestampLt: "2026-05-12T07:20:29.087853",
    };

    // Act
    await EventService.searchEvents("conv-1", null, null, options);

    // Assert: forwarded path contains only limit=100 (caller's 500 clamped).
    const proxyCall = vi.mocked(callCloudProxy).mock.calls[0][0];
    expect(proxyCall.path).toBe(
      "/api/v1/conversation/conv-1/events/search?limit=100",
    );
  });
});
