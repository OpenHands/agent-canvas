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
  name: "Production",
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
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(axios.request).mockReset();
});

describe("callCloudProxy", () => {
  it("calls the cloud host directly with bearer auth and the active backend's X-Org-Id", async () => {
    // Arrange — the user has picked Production + an org in the selector.
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

    // Assert — request goes directly to the cloud, no local-server hop.
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      method: "GET",
      url: `${cloudPersonal.host}/api/v1/app-conversations/search`,
    });
    expect(
      (config as { headers: Record<string, string> }).headers,
    ).toMatchObject({
      Authorization: "Bearer personal-key",
      "X-Org-Id": "org-personal-uuid",
    });
  });

  it("omits X-Org-Id when targeting a cloud backend that is not the active one", async () => {
    // Arrange — fan-out: useAllCloudOrganizations calls callCloudProxy
    // for every registered cloud backend. Sending the active backend's
    // orgId across an unrelated API key would 403 on org-binding
    // mismatch upstream.
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

  it("throws fast when authMode is 'session-api-key' but sessionApiKey is missing", async () => {
    // Arrange — guard against silently sending an unauthenticated request
    // that would 401 upstream.
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id });

    // Act + Assert
    await expect(
      callCloudProxy({
        backend: cloudPersonal,
        method: "GET",
        path: "/api/conversations/c1",
        authMode: "session-api-key",
        sessionApiKey: null,
      }),
    ).rejects.toThrow(/sessionApiKey is required/);
    expect(axios.request).not.toHaveBeenCalled();
  });

  it("omits the Authorization header when authMode is 'none'", async () => {
    // Arrange — used for public endpoints that must not carry the
    // backend's bearer token.
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id });

    // Act
    await callCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/public/whoami",
      authMode: "none",
    });

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    const headers = (config as { headers: Record<string, string> }).headers;
    expect(headers).not.toHaveProperty("Authorization");
    expect(headers).not.toHaveProperty("X-Session-API-Key");
  });

  it("passes responseType: 'blob' through to axios for binary downloads", async () => {
    // Arrange — ZIP / file downloads need the blob responseType so axios
    // doesn't try to JSON-parse the payload.
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id });

    // Act
    await callCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/v1/conversation/c1/files/download",
      responseType: "blob",
    });

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({ responseType: "blob" });
  });

  it("targets hostOverride with X-Session-API-Key for runtime-sandbox calls", async () => {
    // Arrange — cloud sandbox endpoints live at the conversation's
    // runtime URL and authenticate via X-Session-API-Key, not bearer.
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id });

    // Act
    await callCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      hostOverride: "http://abc.runtime.all-hands.dev",
      path: "/api/conversations/conv-1",
      authMode: "session-api-key",
      sessionApiKey: "sess-xyz",
    });

    // Assert
    const [config] = vi.mocked(axios.request).mock.calls[0]!;
    expect(config).toMatchObject({
      method: "GET",
      url: "http://abc.runtime.all-hands.dev/api/conversations/conv-1",
    });
    const headers = (config as { headers: Record<string, string> }).headers;
    expect(headers).toMatchObject({ "X-Session-API-Key": "sess-xyz" });
    expect(headers).not.toHaveProperty("Authorization");
  });
});
