import axios from "axios";
import {
  capturedUpstreamRequest,
  mockUpstreamResponse,
  resetCloudProxyMock,
} from "./_proxy-test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { SecretsService } from "#/api/secrets-service";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "prod",
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
  resetCloudProxyMock();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("SecretsService against cloud backend", () => {
  it("paginates getSecrets directly and returns the merged list", async () => {
    vi.mocked(axios.post)
      .mockResolvedValueOnce({
        data: {
          items: [
            { name: "ALPHA", description: "first" },
            { name: "BETA", description: "second" },
          ],
          next_page_id: "BETA",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ name: "GAMMA", description: "third" }],
          next_page_id: null,
        },
      });

    const secrets = await SecretsService.getSecrets();

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);

    const firstConfig = capturedUpstreamRequest(0);
    expect(firstConfig).toMatchObject({
      method: "GET",
      headers: { Authorization: "Bearer bearer-token" },
    });
    expect((firstConfig as { url: string }).url).toMatch(
      /^https:\/\/app\.all-hands\.dev\/api\/v1\/secrets\/search\?/,
    );
    expect((firstConfig as { url: string }).url).not.toContain("page_id=");

    const secondConfig = capturedUpstreamRequest(1);
    expect((secondConfig as { url: string }).url).toContain("page_id=BETA");

    expect(secrets.map((s) => s.name)).toEqual(["ALPHA", "BETA", "GAMMA"]);
  });

  it("creates a secret via direct POST /api/v1/secrets", async () => {
    mockUpstreamResponse({});

    await SecretsService.createSecret(
      "OPENAI_API_KEY",
      "sk-test",
      "OpenAI key",
    );

    const config = capturedUpstreamRequest(0);
    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/v1/secrets`,
      method: "POST",
      headers: { Authorization: "Bearer bearer-token" },
      data: {
        name: "OPENAI_API_KEY",
        value: "sk-test",
        description: "OpenAI key",
      },
    });
  });

  it("updates a secret via PUT /api/v1/secrets/{id} with name + description only", async () => {
    mockUpstreamResponse({});

    // The form/hook calls updateSecret(secretToEdit, newName, description).
    await SecretsService.updateSecret("OLD_NAME", "NEW_NAME", "renamed");

    const config = capturedUpstreamRequest(0);
    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/v1/secrets/OLD_NAME`,
      method: "PUT",
      headers: { Authorization: "Bearer bearer-token" },
      data: { name: "NEW_NAME", description: "renamed" },
    });
  });

  it("deletes a secret via direct DELETE /api/v1/secrets/{id}", async () => {
    mockUpstreamResponse({});

    await SecretsService.deleteSecret("token with space");

    const config = capturedUpstreamRequest(0);
    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/v1/secrets/token%20with%20space`,
      method: "DELETE",
      headers: { Authorization: "Bearer bearer-token" },
    });
  });
});
