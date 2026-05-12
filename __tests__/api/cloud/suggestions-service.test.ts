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
  vi.mocked(axios.post).mockReset();
  vi.mocked(axios.post).mockResolvedValue({
    data: { items: [], next_page_id: null },
  });
});

afterEach(() => {
  __resetActiveStoreForTests();
  vi.mocked(axios.post).mockReset();
});

describe("getCloudSuggestedTasks", () => {
  it("forwards limit and pageId to the upstream /api/v1/git/suggested-tasks/search endpoint", async () => {
    // Act
    await getCloudSuggestedTasks({ limit: 10, pageId: "p2" });

    // Assert
    const [, body] = vi.mocked(axios.post).mock.calls[0]!;
    const path = (body as { path: string }).path;
    expect(path).toContain("/api/v1/git/suggested-tasks/search");
    expect(path).toContain("limit=10");
    expect(path).toContain("page_id=p2");
  });
});
