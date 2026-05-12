import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { batchGetCloudSandboxes } from "#/api/cloud/sandbox-service.api";
import type { Backend } from "#/api/backend-registry/types";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "cloud-prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id });
  vi.mocked(axios.post).mockReset();
  vi.mocked(axios.post).mockResolvedValue({ data: [] });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(axios.post).mockReset();
});

describe("batchGetCloudSandboxes", () => {
  it("targets /api/v1/sandboxes with one id query param per sandbox id", async () => {
    // Arrange — multiple ids exercises the URLSearchParams.append path,
    // which is the SaaS contract for batch-fetching sandboxes (the GUI
    // reads sandbox.exposed_urls from the response to find the VSCODE
    // URL instead of asking the runtime for a localhost address).
    const ids = ["sandbox-a", "sandbox-b"];

    // Act
    await batchGetCloudSandboxes(ids);

    // Assert — the cloud-proxy envelope encodes a GET against
    // /api/v1/sandboxes?id=sandbox-a&id=sandbox-b on the SaaS.
    const [, body] = vi.mocked(axios.post).mock.calls[0]!;
    const upstream = body as { method: string; path: string };
    expect(upstream.method).toBe("GET");
    expect(upstream.path).toBe(
      "/api/v1/sandboxes?id=sandbox-a&id=sandbox-b",
    );
  });
});
