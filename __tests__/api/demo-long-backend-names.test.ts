import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildDemoLongBackends,
  DEMO_LONG_BACKEND_IDS,
  mergeDemoLongBackends,
} from "#/api/backend-registry/demo-long-backend-names";
import { BACKENDS_STORAGE_KEY } from "#/api/backend-registry/storage";

describe("demo long backend names", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_DEMO_LONG_BACKEND_NAMES", "true");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("builds four stable demo backends with long labels", () => {
    const demos = buildDemoLongBackends("http://127.0.0.1:8000", "session-key");
    expect(demos).toHaveLength(4);
    expect(demos.map((backend) => backend.id)).toEqual([
      DEMO_LONG_BACKEND_IDS.LOCAL_PRIMARY,
      DEMO_LONG_BACKEND_IDS.LOCAL_STAGING,
      DEMO_LONG_BACKEND_IDS.CLOUD_PRODUCTION,
      DEMO_LONG_BACKEND_IDS.CLOUD_ENTERPRISE,
    ]);
    expect(demos[0]?.name.length).toBeGreaterThan(40);
  });

  it("merges missing demo backends into the registry once", () => {
    const seeded = [
      {
        id: "existing-local",
        name: "Local",
        host: "http://127.0.0.1:8000",
        apiKey: "key",
        kind: "local" as const,
      },
    ];

    const merged = mergeDemoLongBackends(seeded);
    expect(merged).toHaveLength(5);
    expect(
      merged.some((backend) => backend.id === DEMO_LONG_BACKEND_IDS.LOCAL_PRIMARY),
    ).toBe(true);

    const stored = JSON.parse(
      window.localStorage.getItem(BACKENDS_STORAGE_KEY) ?? "[]",
    );
    expect(stored).toHaveLength(5);

    const mergedAgain = mergeDemoLongBackends(merged);
    expect(mergedAgain).toHaveLength(5);
  });

  it("does nothing when the env flag is disabled", () => {
    vi.stubEnv("VITE_DEMO_LONG_BACKEND_NAMES", "false");
    const seeded = [
      {
        id: "existing-local",
        name: "Local",
        host: "http://127.0.0.1:8000",
        apiKey: "key",
        kind: "local" as const,
      },
    ];

    expect(mergeDemoLongBackends(seeded)).toEqual(seeded);
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBeNull();
  });
});
