import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { callCloudProxy } from "#/api/cloud/proxy";
import type { Backend } from "#/api/backend-registry/types";

vi.mock("axios");

const localBackend: Backend = {
  id: "local-1",
  name: "Local",
  host: "http://localhost:9000",
  apiKey: "local-key",
  kind: "local",
};

const cloudPersonal: Backend = {
  id: "cloud-personal",
  name: "Production - Personal",
  host: "https://app.all-hands.dev",
  apiKey: "personal-key",
  kind: "cloud",
};

const cloudAcme: Backend = {
  id: "cloud-acme",
  name: "Production - Acme",
  host: "https://app.all-hands.dev",
  apiKey: "acme-key",
  kind: "cloud",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(axios.post).mockReset();
  vi.mocked(axios.post).mockResolvedValue({ data: {} });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(axios.post).mockReset();
});

describe("callCloudProxy X-Org-Id injection", () => {
  it("sends X-Org-Id when targeting the active cloud backend with a selected orgId", async () => {
    // Arrange — active selection points at the cloud backend with a
    // resolved orgId. This is the steady-state case after the user picks
    // an org row in the BackendSelector.
    setRegisteredBackends([localBackend, cloudPersonal]);
    setActiveSelection({
      backendId: cloudPersonal.id,
      orgId: "org-personal-uuid",
    });

    // Act
    await callCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/v1/app-conversations/search",
    });

    // Assert — the upstream envelope carries the X-Org-Id of the active
    // selection so the SaaS can scope this request to the user's
    // locally-chosen org without depending on user.current_org_id.
    const [, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(
      (body as { headers: Record<string, string> }).headers["X-Org-Id"],
    ).toBe("org-personal-uuid");
  });

  it("omits X-Org-Id when targeting a different cloud backend than the active one", async () => {
    // Arrange — the BackendSelector fan-out (e.g. useAllCloudOrganizations)
    // calls callCloudProxy(b) for every registered cloud backend. Sending
    // the active backend's orgId across an unrelated API key would cause
    // the SaaS to 403 on api_key_org_id / X-Org-Id mismatch.
    setRegisteredBackends([cloudPersonal, cloudAcme]);
    setActiveSelection({
      backendId: cloudPersonal.id,
      orgId: "org-personal-uuid",
    });

    // Act — request targets the non-active backend.
    await callCloudProxy({
      backend: cloudAcme,
      method: "GET",
      path: "/api/keys/current",
    });

    // Assert
    const [, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(
      (body as { headers: Record<string, string> }).headers,
    ).not.toHaveProperty("X-Org-Id");
  });
});
