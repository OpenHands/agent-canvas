import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import {
  __resetActiveStoreForTests,
  getRegisteredBackends,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import {
  deleteCloudBackendCredential,
  getOpenHandsProvidedLlmApiKey,
  getStoredCloudBackendCredentials,
  saveCloudBackendCredential,
} from "#/api/cloud-backend-credentials-service";
import { DEFAULT_OPENHANDS_CLOUD_HOST } from "#/utils/constants";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("cloud backend credentials service", () => {
  it("loads reusable Cloud credentials from the backend registry", async () => {
    setRegisteredBackends([
      {
        id: "local-1",
        name: "Local",
        host: "http://localhost:18000",
        apiKey: "local-key",
        kind: "local",
      },
      {
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: `${DEFAULT_OPENHANDS_CLOUD_HOST}/`,
        apiKey: "oh-key",
        kind: "cloud",
      },
    ]);

    await expect(getStoredCloudBackendCredentials()).resolves.toEqual([
      {
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "oh-key",
      },
    ]);
  });

  it("saves a Cloud credential into the backend registry", async () => {
    await expect(
      saveCloudBackendCredential({
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: `${DEFAULT_OPENHANDS_CLOUD_HOST}/`,
        cloudApiKey: "oh-key",
      }),
    ).resolves.toEqual({
      id: "cloud-1",
      name: "OpenHands Cloud",
      host: DEFAULT_OPENHANDS_CLOUD_HOST,
      cloudApiKey: "oh-key",
    });

    expect(getRegisteredBackends()).toEqual(
      expect.arrayContaining([
        {
          id: "cloud-1",
          name: "OpenHands Cloud",
          host: DEFAULT_OPENHANDS_CLOUD_HOST,
          apiKey: "oh-key",
          kind: "cloud",
        },
      ]),
    );
  });

  it("reuses an existing Cloud backend with the same host and key", async () => {
    setRegisteredBackends([
      {
        id: "cloud-existing",
        name: "Existing Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        apiKey: "oh-key",
        kind: "cloud",
      },
    ]);

    await expect(
      saveCloudBackendCredential({
        id: "openhands-cloud",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "oh-key",
      }),
    ).resolves.toEqual({
      id: "cloud-existing",
      name: "Existing Cloud",
      host: DEFAULT_OPENHANDS_CLOUD_HOST,
      cloudApiKey: "oh-key",
    });

    expect(getRegisteredBackends()).toHaveLength(1);
  });

  it("deletes a Cloud credential from the backend registry", async () => {
    setRegisteredBackends([
      {
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        apiKey: "oh-key",
        kind: "cloud",
      },
    ]);

    await expect(
      deleteCloudBackendCredential("cloud-1"),
    ).resolves.toBeUndefined();
    expect(getRegisteredBackends()).toEqual([]);
  });

  it("aborts registry operations when requested", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      getStoredCloudBackendCredentials({ signal: controller.signal }),
    ).rejects.toThrow(/aborted/i);
    await expect(
      saveCloudBackendCredential(
        {
          id: "cloud-1",
          name: "OpenHands Cloud",
          host: DEFAULT_OPENHANDS_CLOUD_HOST,
          cloudApiKey: "oh-key",
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow(/aborted/i);
  });

  it("returns null when the OpenHands-provided LM API key is unavailable", async () => {
    server.use(http.post("*/api/cloud-proxy", () => HttpResponse.json({})));

    await expect(
      getOpenHandsProvidedLlmApiKey({ cloudApiKey: "cloud-key" }),
    ).resolves.toBeNull();
  });

  it("logs and throws axios response details when fetching the LM API key fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.post("*/api/cloud-proxy", () =>
        HttpResponse.json({ error: "cloud unavailable" }, { status: 503 }),
      ),
    );

    await expect(
      getOpenHandsProvidedLlmApiKey({ cloudApiKey: "cloud-key" }),
    ).rejects.toThrow(
      "Failed to fetch OpenHands-provided LM API key (503: cloud unavailable)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to fetch OpenHands-provided LM API key from Cloud",
      "503: cloud unavailable",
    );
  });
});
