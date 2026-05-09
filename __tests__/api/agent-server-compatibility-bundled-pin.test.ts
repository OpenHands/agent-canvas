import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { loadAgentServerInfo } from "#/api/agent-server-compatibility";

const getServerInfoMock = vi.fn();
const createServerClientMock = vi.fn(() => ({
  getServerInfo: getServerInfoMock,
}));

vi.mock("#/api/typescript-client", async () => {
  const actual = await vi.importActual<
    typeof import("#/api/typescript-client")
  >("#/api/typescript-client");
  return {
    ...actual,
    createServerClient: (...args: unknown[]) =>
      createServerClientMock(...(args as [])),
  };
});

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
  getServerInfoMock.mockReset();
  createServerClientMock.mockClear();
  getServerInfoMock.mockResolvedValue({ version: "1.0.0" });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("loadAgentServerInfo", () => {
  it("targets the bundled local backend even when the active backend is cloud", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    await loadAgentServerInfo();

    expect(createServerClientMock).toHaveBeenCalledOnce();
    const callArgs = createServerClientMock.mock.calls[0] as unknown as [
      { host?: string; sessionApiKey?: string | null },
    ];
    const overrides = callArgs[0];

    // Must NOT use the cloud host — that endpoint doesn't exist on SaaS
    // and would fail with a CORS preflight error.
    expect(overrides.host).toBeDefined();
    expect(overrides.host).not.toBe(cloudBackend.host);
    expect(overrides.host).not.toContain("all-hands.dev");
  });
});
