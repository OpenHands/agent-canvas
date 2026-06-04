import axios from "axios";
import {
  capturedUpstreamRequest,
  resetCloudProxyMock,
} from "./_proxy-test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { getCloudSuggestedTasks } from "#/api/cloud/suggestions-service.api";
import type { Backend } from "#/api/backend-registry/types";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

beforeEach(() => {
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id });
  resetCloudProxyMock();
  vi.mocked(axios.post).mockResolvedValue({
    data: { items: [], next_page_id: null },
  });
});

afterEach(() => {
  __resetActiveStoreForTests();
  resetCloudProxyMock();
});

describe("getCloudSuggestedTasks", () => {
  it("forwards limit and pageId to the upstream /api/v1/git/suggested-tasks/search endpoint", async () => {
    // Act
    await getCloudSuggestedTasks({ limit: 10, pageId: "p2" });

    // Assert
    const config = capturedUpstreamRequest(0);
    const url = (config as { url: string }).url;
    expect(url).toContain("/api/v1/git/suggested-tasks/search");
    expect(url).toContain("limit=10");
    expect(url).toContain("page_id=p2");
  });
});
