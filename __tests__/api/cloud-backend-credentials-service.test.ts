import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
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
  it("loads reusable Cloud credentials from the setup backend", async () => {
    server.use(
      http.get("*/setup/backends", () =>
        HttpResponse.json({
          backends: [
            {
              id: "cloud-1",
              name: "OpenHands Cloud",
              host: `${DEFAULT_OPENHANDS_CLOUD_HOST}/`,
              api_key: "oh-key",
              kind: "cloud",
            },
            {
              id: "local-1",
              name: "Local",
              host: "http://localhost:18000",
              api_key: "local-key",
              kind: "local",
            },
          ],
        }),
      ),
    );

    await expect(getStoredCloudBackendCredentials()).resolves.toEqual([
      {
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "oh-key",
      },
    ]);
  });

  it("saves a Cloud credential through the setup backend", async () => {
    let requestBody: unknown = null;
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ backend: requestBody });
      }),
    );

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

    expect(requestBody).toEqual({
      id: "cloud-1",
      name: "OpenHands Cloud",
      host: DEFAULT_OPENHANDS_CLOUD_HOST,
      api_key: "oh-key",
      kind: "cloud",
    });
  });

  it("surfaces setup backend save failures", async () => {
    server.use(
      http.post("*/setup/backends", () =>
        HttpResponse.json({ error: "disk full" }, { status: 507 }),
      ),
    );

    await expect(
      saveCloudBackendCredential({
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "oh-key",
      }),
    ).rejects.toThrow(
      "Failed to save OpenHands Cloud credentials (507: disk full)",
    );
  });

  it("deletes a Cloud credential through the setup backend", async () => {
    let deletedPath = "";
    server.use(
      http.delete("*/setup/backends/:id", ({ params }) => {
        deletedPath = String(params.id);
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(
      deleteCloudBackendCredential("cloud-1"),
    ).resolves.toBeUndefined();
    expect(deletedPath).toBe("cloud-1");
  });

  it("aborts setup backend operations when requested", async () => {
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
