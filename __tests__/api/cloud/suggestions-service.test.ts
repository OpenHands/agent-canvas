import axios from "axios";
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
  vi.mocked(axios.request).mockReset();
  vi.mocked(axios.request).mockResolvedValue({
    data: { items: [], next_page_id: null },
  });
});

afterEach(() => {
  __resetActiveStoreForTests();
  vi.mocked(axios.request).mockReset();
});

describe("getCloudSuggestedTasks", () => {
  it("forwards limit and pageId to the upstream /api/v1/git/suggested-tasks/search endpoint", async () => {
    // Act
    await getCloudSuggestedTasks({ limit: 10, pageId: "p2" });

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const url = (config as { url: string }).url;
    expect(url).toContain("/api/v1/git/suggested-tasks/search");
    expect(url).toContain("limit=10");
    expect(url).toContain("page_id=p2");
  });
});
