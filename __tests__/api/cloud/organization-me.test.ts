import axios from "axios";
import {
  capturedUpstreamRequest,
  resetCloudProxyMock,
} from "./_proxy-test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { getCloudOrganizationMe } from "#/api/cloud/organization-service.api";

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

describe("cloud organization /me", () => {
  it("calls /api/organizations/{orgId}/me directly and returns user_id", async () => {
    const orgId = "0b93b5f2-5396-49f2-8d98-61f906184270";
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        org_id: orgId,
        user_id: orgId,
        email: "hieptl.developer@gmail.com",
        role: "owner",
      },
    });

    const result = await getCloudOrganizationMe(orgId);

    const config = capturedUpstreamRequest(0);
    expect(config).toMatchObject({
      url: `${cloudBackend.host}/api/organizations/${orgId}/me`,
      method: "GET",
      headers: { Authorization: "Bearer bearer-token" },
    });
    expect(result).toEqual({ orgId, userId: orgId });
  });
});
