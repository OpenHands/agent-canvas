import { afterEach, describe, expect, it, vi } from "vitest";
import { getDeploymentDefaultBackends } from "#/api/backend-registry/deployment-backends";

type MutableWindow = Record<string, unknown>;

function setInjectedBackends(value: unknown): void {
  (window as unknown as MutableWindow).__AGENT_CANVAS_DEFAULT_BACKENDS__ =
    value;
}

afterEach(() => {
  delete (window as unknown as MutableWindow).__AGENT_CANVAS_DEFAULT_BACKENDS__;
  vi.unstubAllEnvs();
});

describe("getDeploymentDefaultBackends", () => {
  it("returns an empty list when nothing is configured", () => {
    expect(getDeploymentDefaultBackends()).toEqual([]);
  });

  it("reads an injected window global (array form)", () => {
    setInjectedBackends([
      { host: "http://10.0.0.5:8000", apiKey: "key-a", name: "Box A" },
    ]);

    expect(getDeploymentDefaultBackends()).toEqual([
      {
        id: "deployment:http://10.0.0.5:8000",
        name: "Box A",
        host: "http://10.0.0.5:8000",
        apiKey: "key-a",
        kind: "local",
      },
    ]);
  });

  it("reads an injected window global (JSON string form)", () => {
    setInjectedBackends(
      JSON.stringify([{ host: "10.0.0.6:8000", apiKey: "key-b" }]),
    );

    const result = getDeploymentDefaultBackends();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      host: "http://10.0.0.6:8000",
      apiKey: "key-b",
      name: "http://10.0.0.6:8000",
      kind: "local",
    });
  });

  it("prefers the build-time env var over the window global", () => {
    vi.stubEnv(
      "VITE_DEFAULT_BACKENDS",
      JSON.stringify([{ host: "http://env-host:8000", apiKey: "env-key" }]),
    );
    setInjectedBackends([
      { host: "http://window-host:8000", apiKey: "window-key" },
    ]);

    const result = getDeploymentDefaultBackends();
    expect(result).toHaveLength(1);
    expect(result[0].host).toBe("http://env-host:8000");
  });

  it("drops entries missing host or apiKey and de-duplicates by host", () => {
    setInjectedBackends([
      { host: "http://dup:8000", apiKey: "k1" },
      { host: "http://dup:8000", apiKey: "k2" },
      { host: "http://no-key:8000" },
      { apiKey: "no-host" },
      { host: "http://ok:8000", apiKey: "k3", kind: "cloud" },
    ]);

    const result = getDeploymentDefaultBackends();
    expect(result.map((b) => b.host)).toEqual([
      "http://dup:8000",
      "http://ok:8000",
    ]);
    expect(result[1].kind).toBe("cloud");
  });

  it("returns an empty list for malformed JSON", () => {
    setInjectedBackends("{not-json");
    expect(getDeploymentDefaultBackends()).toEqual([]);
  });
});
