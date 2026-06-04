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
  vi.mocked(axios.post).mockReset();
  vi.mocked(axios.post).mockResolvedValue({ data: {} });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(axios.post).mockReset();
});

// `callCloudProxy` MUST POST every request to /api/cloud-proxy on the local
// agent-server rather than making a direct browser → cloud call.
//
// Why: the cloud app host (and per-conversation runtime sandboxes) only allow
// CORS from `https://app.all-hands.dev` itself. Direct browser calls from any
// other origin (Vite dev, Electron, self-hosted static deployments) get HTTP
// 400 on the CORS preflight and surface to the user as opaque failures like
// "Automations Unavailable" (see fix for issue #XYZ — regression from #1046).
describe("callCloudProxy envelope routing", () => {
  it("POSTs to <local agent-server>/api/cloud-proxy instead of calling the cloud host directly", async () => {
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id, orgId: null });

    await callCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/automation/health",
    });

    // Exactly one POST, to /api/cloud-proxy on the local agent-server.
    // jsdom's default origin is http://localhost:3000, so window.location.origin
    // is the proxy base URL here.
    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1);
    const [url, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/cloud-proxy");

    // The envelope describes the upstream request the proxy should make.
    expect(body).toMatchObject({
      host: cloudPersonal.host,
      method: "GET",
      path: "/api/automation/health",
    });

    // The cloud's bearer token is carried INSIDE the envelope so it
    // never crosses an origin boundary in the browser.
    const envelope = body as { headers: Record<string, string> };
    expect(envelope.headers.Authorization).toBe(
      `Bearer ${cloudPersonal.apiKey}`,
    );

    // And `axios.request` is never used for the upstream call — the proxy
    // POST is the only outbound request.
    expect(vi.mocked(axios.request)).not.toHaveBeenCalled();
  });

  it("uses the local agent-server's session API key on the OUTER POST, not the cloud bearer token", async () => {
    // The local agent-server expects X-Session-API-Key authentication.
    // The cloud bearer token must only appear inside the envelope.body.headers.
    // The session key value here ("test-session-key") is whatever
    // vitest.setup.ts stubs `VITE_SESSION_API_KEY` to — what matters for
    // this regression test is that some X-Session-API-Key is sent AND
    // that no bearer token leaks onto the outer POST.
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id, orgId: null });

    await callCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/automation/v1",
    });

    const [, , config] = vi.mocked(axios.post).mock.calls[0]!;
    const outerHeaders = (config as { headers: Record<string, string> })
      .headers;
    expect(outerHeaders).toHaveProperty("X-Session-API-Key");
    expect(outerHeaders["X-Session-API-Key"]).toBeTruthy();
    expect(outerHeaders.Authorization).toBeUndefined();
  });

  it("also routes runtime-sandbox calls (hostOverride) through the same proxy", async () => {
    // Same flow whether we target the cloud app host or a per-conversation
    // runtime sandbox — neither allows CORS from a non-app.all-hands.dev
    // browser origin.
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({ backendId: cloudPersonal.id, orgId: null });

    await callCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      hostOverride: "https://abc.prod-runtime.all-hands.dev",
      path: "/api/git/changes",
      authMode: "session-api-key",
      sessionApiKey: "runtime-sandbox-session-key",
    });

    const [url, body] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/cloud-proxy");
    expect(body).toMatchObject({
      host: "https://abc.prod-runtime.all-hands.dev",
      path: "/api/git/changes",
    });
    const envelope = body as { headers: Record<string, string> };
    expect(envelope.headers["X-Session-API-Key"]).toBe(
      "runtime-sandbox-session-key",
    );
    expect(envelope.headers.Authorization).toBeUndefined();
  });
});

describe("callCloudProxy X-Org-Id injection", () => {
  it("includes X-Org-Id in the envelope when targeting the active cloud backend with a selected orgId", async () => {
    // Arrange — active selection points at the cloud backend with a
    // resolved orgId. This is the steady-state case after the user picks
    // an org row in the BackendSelector.
    setRegisteredBackends([cloudPersonal]);
    setActiveSelection({
      backendId: cloudPersonal.id,
      orgId: "org-personal-uuid",
    });

    await callCloudProxy({
      backend: cloudPersonal,
      method: "GET",
      path: "/api/v1/app-conversations/search",
    });

    // X-Org-Id is part of the upstream auth headers carried in the envelope
    // body so the cloud backend can scope this request to the user's
    // locally-chosen org without depending on user.current_org_id.
    const [, body] = vi.mocked(axios.post).mock.calls[0]!;
    const envelope = body as { headers: Record<string, string> };
    expect(envelope.headers["X-Org-Id"]).toBe("org-personal-uuid");
  });

  it("omits X-Org-Id when targeting a different cloud backend than the active one", async () => {
    // The BackendSelector fan-out (e.g. useAllCloudOrganizations) calls
    // callCloudProxy(b) for every registered cloud backend. Sending the
    // active backend's orgId across an unrelated API key would cause the
    // cloud backend to 403 on api_key_org_id / X-Org-Id mismatch.
    setRegisteredBackends([cloudPersonal, cloudAcme]);
    setActiveSelection({
      backendId: cloudPersonal.id,
      orgId: "org-personal-uuid",
    });

    // Request targets the non-active backend.
    await callCloudProxy({
      backend: cloudAcme,
      method: "GET",
      path: "/api/keys/current",
    });

    const [, body] = vi.mocked(axios.post).mock.calls[0]!;
    const envelope = body as { headers: Record<string, string> };
    expect(envelope.headers).not.toHaveProperty("X-Org-Id");
  });
});
