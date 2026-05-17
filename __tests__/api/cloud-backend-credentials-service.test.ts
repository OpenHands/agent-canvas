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
  it("throws when the local persistence endpoint is unavailable", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get("*/setup/backends", () =>
        HttpResponse.json({ error: "not found" }, { status: 404 }),
      ),
    );

    await expect(getStoredCloudBackendCredentials()).rejects.toThrow(
      "Failed to load saved OpenHands Cloud credentials (404: not found)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[setup/backends] Failed to load Cloud backend credentials: 404: not found",
    );
  });

  it("throws network errors from the local persistence endpoint", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get("*/setup/backends", () => HttpResponse.error()));

    await expect(getStoredCloudBackendCredentials()).rejects.toThrow(
      "Failed to load saved OpenHands Cloud credentials",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[setup/backends] Failed to load Cloud backend credentials",
      expect.any(String),
    );
  });

  it("loads persisted Cloud backend credentials", async () => {
    server.use(
      http.get("*/setup/backends", () =>
        HttpResponse.json({
          backends: [
            {
              id: "cloud-1",
              name: "OpenHands Cloud",
              host: DEFAULT_OPENHANDS_CLOUD_HOST,
              kind: "cloud",
              api_key: "oh-key",
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

  it("throws malformed JSON responses from the local persistence endpoint", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get(
        "*/setup/backends",
        () => new HttpResponse("{not json", { status: 200 }),
      ),
    );

    await expect(getStoredCloudBackendCredentials()).rejects.toThrow(
      "Malformed response from setup server",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[setup/backends] Malformed JSON response from setup server",
      expect.any(String),
    );
  });

  it("saves a Cloud backend credential through the local persistence endpoint", async () => {
    const savedRequests: unknown[] = [];
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = await request.json();
        savedRequests.push(body);
        return HttpResponse.json({ backend: body });
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

    expect(savedRequests).toEqual([
      {
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        kind: "cloud",
        api_key: "oh-key",
      },
    ]);
  });

  it("throws and logs when saving credentials fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.post("*/setup/backends", () =>
        HttpResponse.json({ error: "server error" }, { status: 500 }),
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
      "Failed to save OpenHands Cloud credentials (500: server error)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[setup/backends] Failed to save Cloud backend credential: 500: server error",
    );
  });

  it("throws malformed JSON responses when saving credentials", async () => {
    server.use(
      http.post(
        "*/setup/backends",
        () => new HttpResponse("{not json", { status: 200 }),
      ),
    );

    await expect(
      saveCloudBackendCredential({
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "oh-key",
      }),
    ).rejects.toThrow("Malformed response from setup server");
  });

  it("throws malformed success payloads when saving credentials", async () => {
    server.use(http.post("*/setup/backends", () => HttpResponse.json({})));

    await expect(
      saveCloudBackendCredential({
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "oh-key",
      }),
    ).rejects.toThrow("Malformed response from setup server");
  });

  it("aborts saving credentials through the local persistence endpoint", async () => {
    const controller = new AbortController();
    controller.abort();

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

  it("deletes a Cloud backend credential through the local persistence endpoint", async () => {
    const deletedIds: string[] = [];
    server.use(
      http.delete("*/setup/backends", ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (id) deletedIds.push(id);
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(
      deleteCloudBackendCredential("cloud:prod"),
    ).resolves.toBeUndefined();
    expect(deletedIds).toEqual(["cloud:prod"]);
  });

  it("throws when deleting a credential fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.delete("*/setup/backends", () => HttpResponse.error()));

    await expect(deleteCloudBackendCredential("cloud:prod")).rejects.toThrow(
      "Failed to delete OpenHands Cloud credentials",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[setup/backends] Failed to delete Cloud backend credential",
      expect.any(String),
    );
  });

  it("throws when deleting a credential returns an error response", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.delete("*/setup/backends", () =>
        HttpResponse.json({ error: "server error" }, { status: 500 }),
      ),
    );

    await expect(deleteCloudBackendCredential("cloud:prod")).rejects.toThrow(
      "Failed to delete OpenHands Cloud credentials (500: server error)",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[setup/backends] Failed to delete Cloud backend credential: 500: server error",
    );
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
      "[setup/backends] Failed to fetch OpenHands-provided LM API key from Cloud",
      "503: cloud unavailable",
    );
  });
});
