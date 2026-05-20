import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCloudOrganizationMe,
  getCloudOrganizations,
  getCurrentCloudApiKey,
} from "#/api/cloud/organization-service.api";
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
  window.localStorage.clear();
  vi.mocked(axios.request).mockReset();
});

afterEach(() => {
  vi.mocked(axios.request).mockReset();
});

describe("cloud organization-service direct calls", () => {
  it("getCloudOrganizations hits the cloud /api/organizations directly with bearer auth and returns normalized data", async () => {
    vi.mocked(axios.request).mockResolvedValue({
      data: {
        items: [{ id: "org-1", name: "Personal" }],
        current_org_id: "org-1",
      },
    });

    const result = await getCloudOrganizations(cloudBackend);

    expect(axios.request).toHaveBeenCalledOnce();
    const [config] = vi.mocked(axios.request).mock.calls[0]!;

    expect(config).toMatchObject({
      method: "GET",
      url: `${cloudBackend.host}/api/organizations`,
      headers: expect.objectContaining({
        Authorization: "Bearer bearer-token",
      }),
    });

    expect(result).toEqual({
      items: [{ id: "org-1", name: "Personal" }],
      currentOrgId: "org-1",
    });
  });

  it("getCurrentCloudApiKey hits /api/keys/current and returns the bound orgId", async () => {
    vi.mocked(axios.request).mockResolvedValue({
      data: {
        id: "key-1",
        name: "k",
        org_id: "org-bound",
        user_id: "user-1",
        auth_type: "bearer",
      },
    });

    const result = await getCurrentCloudApiKey(cloudBackend);

    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect((config as { url: string }).url).toBe(
      `${cloudBackend.host}/api/keys/current`,
    );
    expect(result).toEqual({ orgId: "org-bound", isLegacyKey: false });
  });

  it("getCurrentCloudApiKey treats an upstream 400 as a legacy key (no binding)", async () => {
    const error = Object.assign(new Error("Bad Request"), {
      response: { status: 400 },
    });
    vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);
    vi.mocked(axios.request).mockRejectedValueOnce(error);

    const result = await getCurrentCloudApiKey(cloudBackend);

    expect(result).toEqual({ orgId: null, isLegacyKey: true });
  });

  it("getCloudOrganizationMe hits /api/organizations/{orgId}/me directly and returns the user id", async () => {
    // Arrange — the GUI calls /me to learn whether orgId is the user's
    // personal workspace (cloud contract: personal-workspace org id ===
    // user id).
    const orgId = "0b93b5f2-5396-49f2-8d98-61f906184270";
    vi.mocked(axios.request).mockResolvedValue({
      data: { org_id: orgId, user_id: orgId, email: "u@example.com" },
    });

    // Act
    const result = await getCloudOrganizationMe(orgId, cloudBackend);

    // Assert — direct GET, encoded org id in the path.
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      method: "GET",
      url: `${cloudBackend.host}/api/organizations/${orgId}/me`,
    });
    expect(result).toEqual({ orgId, userId: orgId });
  });

  it("getCurrentCloudApiKey rethrows non-400 upstream errors (e.g. revoked key)", async () => {
    const error = Object.assign(new Error("Unauthorized"), {
      response: { status: 401 },
    });
    vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);
    vi.mocked(axios.request).mockRejectedValueOnce(error);

    await expect(getCurrentCloudApiKey(cloudBackend)).rejects.toBe(error);
  });
});
