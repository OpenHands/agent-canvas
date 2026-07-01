import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { callCloudApi, callLegacyRuntimeCloudProxy } from "#/api/cloud/proxy";
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

describe("callCloudApi X-Org-Id injection", () => {
  it("sends X-Org-Id when targeting the active cloud backend with a selected orgId", async () => {
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({
      backendId: cloudPersonal.id,
      orgId: "org-personal-uuid",
    });

    await callCloudApi({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/v1/app-conversations/search",
    });

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
    setRegisteredBackends([cloudPersonal, cloudAcme]);
    setActiveSelection({
      backendId: cloudPersonal.id,
      orgId: "org-personal-uuid",
    });

    await callCloudApi({
      backend: cloudAcme,
      method: "GET",
      path: "/api/keys/current",
    });

    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(
      (config as { headers: Record<string, string> }).headers,
    ).not.toHaveProperty("X-Org-Id");
  });
});

describe("callCloudApi direct routing", () => {
  it("sends automation requests straight to the cloud host with the API key", async () => {
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id, orgId: null });
    const page = { automations: [], total: 0 };
    vi.mocked(axios.request).mockResolvedValue({ data: page });

    const result = await callCloudApi({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/automation/v1?limit=50&offset=0",
    });

    expect(axios.post).not.toHaveBeenCalled();
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      url: `${cloudPersonal.host}/api/automation/v1?limit=50&offset=0`,
      method: "GET",
    });
    expect(
      (config as { headers: Record<string, string> }).headers.Authorization,
    ).toBe(`Bearer ${cloudPersonal.apiKey}`);
    expect(result).toEqual(page);
  });

  it("forwards the blob responseType and fail-fast timeout to the direct request", async () => {
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id, orgId: null });

    await callCloudApi({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/automation/v1/auto-1/tarball",
      responseType: "blob",
      timeoutSeconds: 5,
    });

    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      responseType: "blob",
      timeout: 5000,
    });
  });
});

describe("callLegacyRuntimeCloudProxy routing", () => {
  const runtimeHost = "https://abc123.prod-runtime.all-hands.dev";

  it("routes through local /api/cloud-proxy instead of the upstream runtime host", async () => {
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id, orgId: null });
    vi.mocked(axios.post).mockResolvedValue({ data: { items: [] } });

    const result = await callLegacyRuntimeCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      host: runtimeHost,
      path: "/api/bash/bash_events/search",
      sessionApiKey: "sandbox-session",
    });

    expect(axios.request).not.toHaveBeenCalled();
    const [url, envelope] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(envelope).toMatchObject({
      host: runtimeHost,
      method: "GET",
      path: "/api/bash/bash_events/search",
      headers: { "X-Session-API-Key": "sandbox-session" },
    });
    expect(result).toEqual({ items: [] });
  });

  it("carries explicit headers inside the proxy envelope", async () => {
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({
      backendId: cloudPersonal.id,
      orgId: "org-personal-uuid",
    });

    await callLegacyRuntimeCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      host: runtimeHost,
      path: "/api/bash/bash_events/search",
      sessionApiKey: "sandbox-session",
      headers: { "X-Custom": "custom" },
    });

    const [, envelope] = vi.mocked(axios.post).mock.calls[0]!;
    expect(
      (envelope as { headers: Record<string, string> }).headers,
    ).toMatchObject({
      "X-Session-API-Key": "sandbox-session",
      "X-Custom": "custom",
    });
  });
});
