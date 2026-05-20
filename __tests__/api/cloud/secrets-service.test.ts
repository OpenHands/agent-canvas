import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import {
  createCloudSecret,
  deleteCloudSecret,
  fetchCloudSecrets,
  updateCloudSecret,
} from "#/api/cloud/secrets-service.api";

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
  vi.mocked(axios.request).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(axios.request).mockReset();
});

describe("cloud secrets-service direct calls", () => {
  it("fetchCloudSecrets walks every page and returns the merged list", async () => {
    // Arrange — two pages: first carries next_page_id, second terminates.
    vi.mocked(axios.request)
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

    // Act
    const result = await fetchCloudSecrets();

    // Assert
    expect(axios.request).toHaveBeenCalledTimes(2);

    const [firstConfig] = vi.mocked(axios.request).mock.calls[0]!;
    expect((firstConfig as { url: string }).url).toContain(
      `${cloudBackend.host}/api/v1/secrets/search?`,
    );
    expect((firstConfig as { url: string }).url).not.toContain("page_id=");

    const [secondConfig] = vi.mocked(axios.request).mock.calls[1]!;
    expect((secondConfig as { url: string }).url).toContain("page_id=BETA");

    expect(result.map((s) => s.name)).toEqual(["ALPHA", "BETA", "GAMMA"]);
  });

  it("createCloudSecret POSTs the secret payload directly to /api/v1/secrets", async () => {
    // Arrange
    vi.mocked(axios.request).mockResolvedValueOnce({ data: {} });

    // Act
    await createCloudSecret("OPENAI_API_KEY", "sk-test", "OpenAI key");

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      method: "POST",
      url: `${cloudBackend.host}/api/v1/secrets`,
      data: {
        name: "OPENAI_API_KEY",
        value: "sk-test",
        description: "OpenAI key",
      },
    });
  });

  it("updateCloudSecret PUTs name + description to /api/v1/secrets/{id} (value field stripped)", async () => {
    // Arrange — the cloud PUT contract excludes value, matching what the
    // edit form actually sends from useUpdateSecret.
    vi.mocked(axios.request).mockResolvedValueOnce({ data: {} });

    // Act
    await updateCloudSecret("OLD_NAME", "NEW_NAME", "renamed");

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      method: "PUT",
      url: `${cloudBackend.host}/api/v1/secrets/OLD_NAME`,
      data: { name: "NEW_NAME", description: "renamed" },
    });
  });

  it("deleteCloudSecret URL-encodes the name when issuing DELETE", async () => {
    // Arrange
    vi.mocked(axios.request).mockResolvedValueOnce({ data: {} });

    // Act — name contains a space; URL must be percent-encoded.
    await deleteCloudSecret("token with space");

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      method: "DELETE",
      url: `${cloudBackend.host}/api/v1/secrets/token%20with%20space`,
    });
  });
});
