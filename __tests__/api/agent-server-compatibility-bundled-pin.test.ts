import { ServerClient } from "@openhands/typescript-client/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { loadAgentServerInfo } from "#/api/agent-server-compatibility";

const { getServerInfoMock } = vi.hoisted(() => ({
  getServerInfoMock: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  ServerClient: vi.fn(function ServerClientMock() {
    return {
      getServerInfo: getServerInfoMock,
    };
  }),
}));

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
  vi.mocked(ServerClient).mockClear();
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

    expect(ServerClient).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(ServerClient).mock.calls[0] as unknown as [
      { host?: string; apiKey?: string | null },
    ];
    const overrides = callArgs[0];

    // Must NOT use the cloud host — that endpoint doesn't exist on SaaS
    // and would fail with a CORS preflight error.
    expect(overrides.host).toBeDefined();
    expect(overrides.host).not.toBe(cloudBackend.host);
    expect(overrides.host).not.toContain("all-hands.dev");
  });
});
