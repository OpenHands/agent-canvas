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
  vi.mocked(axios.request).mockReset();
  vi.mocked(axios.request).mockResolvedValue({ data: {} });
  vi.mocked(axios.post).mockReset();
  vi.mocked(axios.post).mockResolvedValue({ data: {} });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(axios.request).mockReset();
  vi.mocked(axios.post).mockReset();
});

describe("callCloudProxy X-Org-Id injection", () => {
  it("sends X-Org-Id when targeting the active cloud backend with a selected orgId", async () => {
    // Arrange — active selection points at the cloud backend with a
    // resolved orgId. This is the steady-state case after the user picks
    // an org row in the BackendSelector.
    setRegisteredBackends([cloudPersonal]);
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

    // Assert — the request carries the X-Org-Id of the active selection so the
    // cloud backend can scope this request to the user's locally-chosen org
    // without depending on user.current_org_id.
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      url: `${cloudPersonal.host}/api/v1/app-conversations/search`,
      method: "GET",
    });
    expect(
      (config as { headers: Record<string, string> }).headers["X-Org-Id"],
    ).toBe("org-personal-uuid");
  });

  it("omits X-Org-Id when targeting a different cloud backend than the active one", async () => {
    // Arrange — the BackendSelector fan-out (e.g. useAllCloudOrganizations)
    // calls callCloudProxy(b) for every registered cloud backend. Sending
    // the active backend's orgId across an unrelated API key would cause
    // the cloud backend to 403 on api_key_org_id / X-Org-Id mismatch.
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
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(
      (config as { headers: Record<string, string> }).headers,
    ).not.toHaveProperty("X-Org-Id");
  });
});

describe("callCloudProxy forceProxy routing", () => {
  it("routes through the local /api/cloud-proxy instead of the cloud host when forceProxy is set", async () => {
    // Arrange — automation endpoints opt into the proxy hop because the
    // standalone automation service's CORS allowlist rejects browser
    // requests from the local GUI origin.
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id, orgId: null });
    vi.mocked(axios.post).mockResolvedValue({ data: { status: "ok" } });

    // Act
    const result = await callCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/automation/health",
      forceProxy: true,
    });

    // Assert — the browser only makes a same-origin POST to the bundled
    // agent-server's proxy endpoint carrying the upstream call as an
    // envelope, and the upstream payload is unwrapped for the caller.
    expect(axios.request).not.toHaveBeenCalled();
    const [url, envelope] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(envelope).toMatchObject({
      host: cloudPersonal.host,
      method: "GET",
      path: "/api/automation/health",
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("carries bearer auth and X-Org-Id inside the proxy envelope", async () => {
    // Arrange — org scoping must survive the server-side hop: the envelope
    // headers are what the agent-server attaches to the upstream call in
    // place of the headers a direct browser request would have sent.
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({
      backendId: cloudPersonal.id,
      orgId: "org-personal-uuid",
    });

    // Act
    await callCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/automation/health",
      forceProxy: true,
    });

    // Assert
    const [, envelope] = vi.mocked(axios.post).mock.calls[0]!;
    expect(
      (envelope as { headers: Record<string, string> }).headers,
    ).toMatchObject({
      Authorization: `Bearer ${cloudPersonal.apiKey}`,
      "X-Org-Id": "org-personal-uuid",
    });
  });
});
