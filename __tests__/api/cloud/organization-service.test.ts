import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  vi.mocked(axios.post).mockReset();
});

afterEach(() => {
  vi.mocked(axios.post).mockReset();
});

describe("cloud organization-service via local proxy", () => {
  it("getCloudOrganizations posts the right envelope to the local proxy and returns normalized data", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        items: [{ id: "org-1", name: "Personal" }],
        current_org_id: "org-1",
      },
    });

    const result = await getCloudOrganizations(cloudBackend);

    expect(axios.post).toHaveBeenCalledOnce();
    const [url, body, options] = vi.mocked(axios.post).mock.calls[0]!;

    // Should target the bundled local agent-server, not the cloud host.
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(url).not.toContain("app.all-hands.dev");

    // The envelope carries the cloud host + path + bearer header.
    expect(body).toMatchObject({
      host: cloudBackend.host,
      method: "GET",
      path: "/api/organizations",
      headers: { Authorization: "Bearer bearer-token" },
    });

    // The outer request to the local agent-server uses the local
    // X-Session-API-Key auth, NOT the cloud bearer.
    expect(
      (options as { headers?: Record<string, string> } | undefined)?.headers ??
        {},
    ).not.toHaveProperty("Authorization");

    expect(result).toEqual({
      items: [{ id: "org-1", name: "Personal" }],
      currentOrgId: "org-1",
    });
  });

  it("getCurrentCloudApiKey hits /api/keys/current and returns the bound orgId", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        id: "key-1",
        name: "k",
        org_id: "org-bound",
        user_id: "user-1",
        auth_type: "bearer",
      },
    });

    const result = await getCurrentCloudApiKey(cloudBackend);

    const [, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect((body as { path: string }).path).toBe("/api/keys/current");
    expect(result).toEqual({ orgId: "org-bound", isLegacyKey: false });
  });

  it("getCurrentCloudApiKey treats an upstream 400 as a legacy key (no binding)", async () => {
    const error = Object.assign(new Error("Bad Request"), {
      response: { status: 400 },
    });
    vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);
    vi.mocked(axios.post).mockRejectedValueOnce(error);

    const result = await getCurrentCloudApiKey(cloudBackend);

    expect(result).toEqual({ orgId: null, isLegacyKey: true });
  });

  it("getCurrentCloudApiKey rethrows non-400 upstream errors (e.g. revoked key)", async () => {
    const error = Object.assign(new Error("Unauthorized"), {
      response: { status: 401 },
    });
    vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);
    vi.mocked(axios.post).mockRejectedValueOnce(error);

    await expect(getCurrentCloudApiKey(cloudBackend)).rejects.toBe(error);
  });
});
