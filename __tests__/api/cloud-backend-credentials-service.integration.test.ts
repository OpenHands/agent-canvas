import { afterEach, describe, expect, it } from "vitest";
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
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("cloud backend credentials service integration", () => {
  it("round-trips Cloud credentials through the setup endpoint client", async () => {
    const credentials = new Map<string, unknown>();
    server.use(
      http.get("*/setup/backends", () =>
        HttpResponse.json({ backends: Array.from(credentials.values()) }),
      ),
      http.post("*/setup/backends", async ({ request }) => {
        const body = (await request.json()) as { id: string };
        credentials.set(body.id, body);
        return HttpResponse.json({ backend: body });
      }),
      http.delete("*/setup/backends", ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (id) credentials.delete(id);
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(
      saveCloudBackendCredential({
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: `${DEFAULT_OPENHANDS_CLOUD_HOST}/`,
        cloudApiKey: "cloud-key",
      }),
    ).resolves.toEqual({
      id: "cloud-1",
      name: "OpenHands Cloud",
      host: DEFAULT_OPENHANDS_CLOUD_HOST,
      cloudApiKey: "cloud-key",
    });

    await expect(getStoredCloudBackendCredentials()).resolves.toEqual([
      {
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        cloudApiKey: "cloud-key",
      },
    ]);

    await expect(
      deleteCloudBackendCredential("cloud-1"),
    ).resolves.toBeUndefined();
    await expect(getStoredCloudBackendCredentials()).resolves.toEqual([]);
  });

  it("fetches an OpenHands-provided LM API key through the real cloud proxy client", async () => {
    const proxyRequests: unknown[] = [];
    server.use(
      http.post("*/api/cloud-proxy", async ({ request }) => {
        const body = await request.json();
        proxyRequests.push(body);
        return HttpResponse.json({ key: "lm-key" });
      }),
    );

    await expect(
      getOpenHandsProvidedLlmApiKey({
        cloudApiKey: "cloud-key",
        host: `${DEFAULT_OPENHANDS_CLOUD_HOST}/`,
      }),
    ).resolves.toBe("lm-key");

    expect(proxyRequests).toEqual([
      expect.objectContaining({
        host: DEFAULT_OPENHANDS_CLOUD_HOST,
        method: "GET",
        path: "/api/keys/llm/byor",
        headers: expect.objectContaining({
          Authorization: "Bearer cloud-key",
        }),
      }),
    ]);
  });
});
