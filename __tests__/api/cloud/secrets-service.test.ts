import axios from "axios";
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
  vi.mocked(axios.post).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("SecretsService against cloud backend", () => {
  it("paginates getSecrets through /api/cloud-proxy and returns the merged list", async () => {
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

    const [firstUrl, firstBody] = vi.mocked(axios.post).mock.calls[0]!;
    expect(firstUrl).toMatch(/\/api\/cloud-proxy$/);
    expect(firstBody).toMatchObject({
      host: cloudBackend.host,
      method: "GET",
    });
    expect((firstBody as { path: string }).path).toMatch(
      /^\/api\/v1\/secrets\/search\?/,
    );
    expect((firstBody as { path: string }).path).not.toContain("page_id=");

    const [, secondBody] = vi.mocked(axios.post).mock.calls[1]!;
    expect((secondBody as { path: string }).path).toContain("page_id=BETA");

    expect(secrets.map((s) => s.name)).toEqual(["ALPHA", "BETA", "GAMMA"]);
  });

  it("creates a secret via POST /api/v1/secrets through the cloud proxy", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} });

    await SecretsService.createSecret(
      "OPENAI_API_KEY",
      "sk-test",
      "OpenAI key",
    );

    const [url, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(body).toMatchObject({
      host: cloudBackend.host,
      method: "POST",
      path: "/api/v1/secrets",
      body: {
        name: "OPENAI_API_KEY",
        value: "sk-test",
        description: "OpenAI key",
      },
    });
  });

  it("updates a secret via PUT /api/v1/secrets/{id} with name + description only", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} });

    // The form/hook calls updateSecret(secretToEdit, newName, description).
    await SecretsService.updateSecret("OLD_NAME", "NEW_NAME", "renamed");

    const [url, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(body).toMatchObject({
      host: cloudBackend.host,
      method: "PUT",
      path: "/api/v1/secrets/OLD_NAME",
      body: { name: "NEW_NAME", description: "renamed" },
    });
  });

  it("deletes a secret via DELETE /api/v1/secrets/{id} through the cloud proxy", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} });

    await SecretsService.deleteSecret("token with space");

    const [url, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(body).toMatchObject({
      host: cloudBackend.host,
      method: "DELETE",
      path: "/api/v1/secrets/token%20with%20space",
    });
  });
});
