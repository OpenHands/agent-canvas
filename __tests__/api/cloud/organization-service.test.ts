import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import {
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
  __resetActiveStoreForTests();
  setRegisteredBackends([]);
  vi.mocked(axios.request).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(axios.request).mockReset();
});

describe("cloud organization-service", () => {
  it("getCloudOrganizations calls the cloud API directly and returns normalized data", async () => {
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
      url: `${cloudBackend.host}/api/organizations`,
      method: "GET",
      headers: { Authorization: "Bearer bearer-token" },
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
    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/keys/current`,
      method: "GET",
      headers: { Authorization: "Bearer bearer-token" },
    });
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

  it("getCurrentCloudApiKey rethrows non-400 upstream errors (e.g. revoked key)", async () => {
    const error = Object.assign(new Error("Unauthorized"), {
      response: { status: 401 },
    });
    vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);
    vi.mocked(axios.request).mockRejectedValueOnce(error);

    await expect(getCurrentCloudApiKey(cloudBackend)).rejects.toBe(error);
  });
});
