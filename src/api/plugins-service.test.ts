import { beforeEach, describe, expect, it, vi } from "vitest";
import { PluginsClient } from "@openhands/typescript-client/clients";
import {
  setActiveSelection,
  setRegisteredBackends,
} from "./backend-registry/active-store";
import PluginsService from "./plugins-service";

vi.mock("@openhands/typescript-client/clients", () => ({
  PluginsClient: vi.fn(),
}));

const getPluginsMarketplace = vi.fn();
const close = vi.fn();

function useBackend(kind: "local" | "cloud"): void {
  setRegisteredBackends([
    {
      id: kind,
      name: kind,
      host: "http://127.0.0.1:8001",
      apiKey: "session-key",
      kind,
    },
  ]);
  setActiveSelection({ backendId: kind, orgId: null });
}

describe("PluginsService.getPluginsMarketplace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(PluginsClient).mockImplementation(function MockPluginsClient() {
      return { getPluginsMarketplace, close } as unknown as PluginsClient;
    } as unknown as typeof PluginsClient);
  });

  it("returns the catalog from the local agent-server", async () => {
    useBackend("local");
    const plugin = {
      name: "city-weather",
      description: "Weather plugin",
      source: "github:OpenHands/extensions",
      ref: null,
      repo_path: "plugins/city-weather",
      installed: false,
    };
    getPluginsMarketplace.mockResolvedValue({ plugins: [plugin] });

    const result = await PluginsService.getPluginsMarketplace();

    expect(result).toEqual([plugin]);
    expect(getPluginsMarketplace).toHaveBeenCalledTimes(1);
  });

  it("returns an empty catalog on a cloud backend without calling the client", async () => {
    useBackend("cloud");

    const result = await PluginsService.getPluginsMarketplace();

    expect(result).toEqual([]);
    expect(PluginsClient).not.toHaveBeenCalled();
  });

  it("returns an empty catalog when the local request fails", async () => {
    useBackend("local");
    getPluginsMarketplace.mockRejectedValue(new Error("unreachable"));

    const result = await PluginsService.getPluginsMarketplace();

    expect(result).toEqual([]);
  });
});
