import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { getCloudRepositoryBranches } from "#/api/cloud/git-service.api";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

const emptyBranchPage = {
  data: { items: [], next_page_id: null },
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id });
  vi.mocked(axios.request).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("getCloudRepositoryBranches", () => {
  it("includes an empty query parameter when listing all branches so the upstream schema is satisfied", async () => {
    // Arrange
    vi.mocked(axios.request).mockResolvedValueOnce(emptyBranchPage);

    // Act
    await getCloudRepositoryBranches({
      provider: "github",
      repository: "hieptl/hieptl",
    });

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const url = (config as { url: string }).url;
    expect(url).toMatch(/[?&]query=(&|$)/);
  });

  it("forwards a non-empty query parameter when searching branches", async () => {
    // Arrange
    vi.mocked(axios.request).mockResolvedValueOnce(emptyBranchPage);

    // Act
    await getCloudRepositoryBranches({
      provider: "github",
      repository: "hieptl/hieptl",
      query: "feature/login",
    });

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const url = (config as { url: string }).url;
    expect(url).toContain("query=feature%2Flogin");
  });
});
